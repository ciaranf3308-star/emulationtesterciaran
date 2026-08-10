/**
 * parseVimmDetail – conservative detail page parser
 *
 * Only fields actually supported by live HTML – use conservative selectors.
 * Must NOT extract download URLs.
 * Throws ParserError when expected structure missing.
 */

import type { DiscoveryGameDetail, ParserError } from '../../types';
import { createParserError } from '../../types';
import { VIMM_PARSER_VERSION_DETAIL } from './types';
import { buildDetailUrl } from './vimmRoutes';

export const PARSER_VERSION = VIMM_PARSER_VERSION_DETAIL;

function makeErr(httpStatus: number, message: string, hint?: string): ParserError {
  return createParserError('vimms', 'detail', httpStatus, PARSER_VERSION, message, hint);
}

function textContent(el: Element | null): string | undefined {
  if (!el) return undefined;
  const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return t.length ? t.slice(0, 1000) : undefined;
}

function detectAvailabilityFull(text: string) {
  const low = text.toLowerCase();
  if (
    low.includes('no longer available') ||
    low.includes('publisher request') ||
    low.includes('takedown') ||
    low.includes('taken down') ||
    low.includes('dmca')
  ) return 'takedown' as const;
  if (low.includes('download not available') || low.includes('not available') || low.includes('unavailable')) return 'unavailable' as const;
  return 'available' as const;
}

function hasDomParser() {
  return typeof (globalThis as any).DOMParser !== 'undefined' || typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).window.DOMParser !== 'undefined';
}

function parseWithDom(html: string, _providerId: string, detailId: string): DiscoveryGameDetail | ParserError {
  void _providerId
  let doc: Document;
  try {
    const Parser = (globalThis as any).DOMParser || (globalThis as any).window?.DOMParser;
    if (!Parser) throw new Error('DOMParser not present');
    doc = new Parser().parseFromString(html, 'text/html') as Document;
  } catch (e) {
    return makeErr(200, `DOMParser failure: ${(e as Error).message}`, 'DOMParser');
  }

  const bodyText = doc.body?.textContent || '';
  if (bodyText.length < 100) {
    return makeErr(200, 'Detail page too small, schema likely changed', 'body <100 chars');
  }

  // Title – first try <h1>, then title tag, then vault/id fallback
  let title =
    textContent(doc.querySelector('h1')) ||
    textContent(doc.querySelector('title'))?.replace(/ - Vimm.*$/i, '') ||
    `Game ${detailId}`;

  title = title.slice(0, 300);

  // System – look for breadcrumb or system badge near vault
  let systemToken = '';
  const sysEl =
    doc.querySelector('[class*="system"]') ||
    doc.querySelector('a[href*="/vault/?p=list&system="]') ||
    null;
  if (sysEl) {
    const sysText = sysEl.textContent?.trim() || '';
    const href = (sysEl as HTMLAnchorElement).getAttribute?.('href') || '';
    const sysMatch = href.match(/system=([^&]+)/);
    if (sysMatch) systemToken = decodeURIComponent(sysMatch[1]);
    else if (sysText.length <= 20) systemToken = sysText;
  }

  // Regions / Languages / MediaFormat etc – look for table rows dt/dd or tr td
  const detail: Partial<DiscoveryGameDetail> = {};

  // Helper to search for label then value sibling
  function findByLabel(labels: string[]): string | undefined {
    const nodes = Array.from(doc.querySelectorAll('th, dt, td, li, div')) as Element[];
    for (const label of labels) {
      const low = label.toLowerCase();
      for (const n of nodes) {
        const txt = (n.textContent || '').toLowerCase().trim();
        if (txt === low || txt.startsWith(low + ':') || txt === low + ':') {
          // sibling
          let sib: Element | null = n.nextElementSibling;
          if (sib && sib.textContent?.trim()) return sib.textContent.trim().slice(0, 300);
          // parent row's second cell
          const parent = n.parentElement;
          if (parent) {
            const cells = Array.from(parent.children);
            const idx = cells.indexOf(n);
            if (idx >= 0 && idx + 1 < cells.length) {
              const v = (cells[idx + 1].textContent || '').trim();
              if (v) return v.slice(0, 300);
            }
          }
        }
        // also handle "Label: Value" inside same element
        if (txt.startsWith(low + ':') || txt.startsWith(low + ' :')) {
          const original = (n.textContent || '').trim();
          const parts = original.split(':');
          if (parts.length > 1) {
            const val = parts.slice(1).join(':').trim().slice(0, 300);
            if (val) return val;
          }
        }
      }
    }
    return undefined;
  }

  // Simple extraction via regex on whole html as fallback for dom missing table structure

  const availability = detectAvailabilityFull(bodyText);

  // publisher / developer etc – optional
  detail.publisher = findByLabel(['publisher', 'publishers']);
  detail.developer = findByLabel(['developer', 'developers', 'author']);
  detail.players = findByLabel(['players', 'player']);
  detail.description = findByLabel(['description']) || textContent(doc.querySelector('p'))?.slice(0, 2000);

  // Verification / crc/md5/sha1 – only if present in semantic fields
  detail.crc = findByLabel(['crc', 'crc32']);
  detail.md5 = findByLabel(['md5']);
  detail.sha1 = findByLabel(['sha1', 'sha-1', 'sha']);
  detail.fileSize = findByLabel(['size', 'file size', 'filesize']);
  detail.serial = findByLabel(['serial', 'product code']);
  detail.mediaFormat = findByLabel(['media', 'format', 'media format']);
  detail.verification = findByLabel(['verified', 'verification']);

  // disc count – via #disc_number or files count heuristic
  let discCount: number | undefined;
  const discEl = doc.querySelector('#disc_number, [id*="disc"], [name="mediaId"]') as HTMLElement | null;
  if (discEl) {
    // If there's a select/input indicating disc numbers
    if (discEl.tagName?.toLowerCase() === 'select') {
      const opts = (discEl as HTMLSelectElement).options?.length;
      if (opts && opts > 0) discCount = opts;
    } else {
      const valAttr = discEl.getAttribute?.('value') || discEl.textContent || '';
      const m = valAttr.match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > 1 && n < 20) discCount = n;
      }
    }
  }
  // files count
  let files: string[] | undefined;
  const filesEl = doc.querySelectorAll('input[name="mediaId"]');
  if (filesEl.length > 1) {
    discCount = filesEl.length;
    files = Array.from(filesEl).map((el, i) => (el as HTMLInputElement).value || `disc-${i + 1}`).slice(0, 20);
  }

  // regions/languages extraction – comma separated
  const regionStr = findByLabel(['region', 'regions']);
  if (regionStr) {
    const parts = regionStr.split(/[,|\/]/).map(s => s.trim()).filter(Boolean).slice(0, 10);
    if (parts.length) detail.regions = parts;
  }
  const langStr = findByLabel(['language', 'languages']);
  if (langStr) {
    const lparts = langStr.split(/[,|\/]/).map(s => s.trim()).filter(Boolean).slice(0, 10);
    if (lparts.length) detail.languages = lparts;
  }

  // thumbnail – img inside detail
  let thumbnailUrl: string | undefined;
  const img = doc.querySelector('img[src]') as HTMLImageElement | null;
  if (img && img.src) {
    try {
      const u = new URL(img.src, 'https://vimm.net');
      if (u.protocol === 'https:') thumbnailUrl = u.toString().slice(0, 500);
    } catch {}
  }

  // year extraction
  let year: number | undefined;
  const yearMatch = bodyText.match(/\b(19\d{2}|20[0-2]\d|2030)\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (!isNaN(y) && y >= 1970 && y <= 2030) year = y;
  }

  // Must have at least title + id + external url -> otherwise schema changed
  if (!title || title.length < 2) {
    return makeErr(200, 'Detail title missing – schema changed', 'h1 / title');
  }

  // Build final detail object – provider fields minimal / verified only
  const out: DiscoveryGameDetail = {
    provider: 'vimms',
    providerId: detailId,
    systemId: '', // caller may override via systemId argument
    externalSystem: systemToken || 'unknown',
    title,
    externalUrl: buildDetailUrl(detailId),
    availability,
    thumbnailUrl,
    year,
    description: detail.description?.slice(0, 5000),
    developer: detail.developer?.slice(0, 200),
    publisher: detail.publisher?.slice(0, 200),
    players: detail.players?.slice(0, 50),
    regions: detail.regions,
    languages: detail.languages,
    mediaFormat: detail.mediaFormat,
    verification: detail.verification,
    crc: detail.crc,
    md5: detail.md5,
    sha1: detail.sha1,
    fileSize: detail.fileSize,
    serial: detail.serial,
    discCount,
    files,
  };

  return out;
}

function parseWithRegex(html: string, _providerId: string, detailId: string): DiscoveryGameDetail | ParserError {
  void _providerId
  const low = html.toLowerCase();
  if (!html || html.length < 100) return makeErr(200, 'Detail HTML too small', 'html length');
  const titleMatch = html.match(/<h1[^>]*>([^<]{1,300})<\/h1>/i) || html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  let title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : `Game ${detailId}`;
  title = title.replace(/ - vimm.*$/i, '').trim().slice(0, 300);
  if (!title || title.length < 2) return makeErr(200, 'Detail title missing in regex path', 'h1/title');

  const availLow = low;
  const availability = detectAvailabilityFull(availLow);

  const yearMatch = html.match(/\b(19\d{2}|20[0-2]\d|2030)\b/);
  let year: number | undefined;
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (!isNaN(y)) year = y;
  }

  let thumbnailUrl: string | undefined;
  const imgM = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgM && imgM[1]) {
    try {
      const u = new URL(imgM[1], 'https://vimm.net');
      if (u.protocol === 'https:') thumbnailUrl = u.toString().slice(0, 500);
    } catch {}
  }

  // Minimal detail – other fields optional
  return {
    provider: 'vimms',
    providerId: detailId,
    systemId: '',
    externalSystem: 'unknown',
    title,
    externalUrl: buildDetailUrl(detailId),
    availability,
    thumbnailUrl,
    year,
  };
}

export function parseVimmDetail(html: string, providerId: string, detailId: string): DiscoveryGameDetail {
  if (!html) throw makeErr(200, 'Empty HTML for detail', 'html empty');
  if (!/^\d+$/.test(detailId)) throw makeErr(200, `Invalid detailId '${detailId}' must be numeric`, 'detailId numeric');
  if (hasDomParser()) {
    const res = parseWithDom(html, providerId, detailId);
    if ('provider' in (res as any) && (res as DiscoveryGameDetail).provider) return res as DiscoveryGameDetail;
    throw res; // ParserError
  }
  const out = parseWithRegex(html, providerId, detailId);
  if ((out as any).provider) return out as DiscoveryGameDetail;
  throw out;
}
