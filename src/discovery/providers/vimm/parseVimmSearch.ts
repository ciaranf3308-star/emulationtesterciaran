/**
 * parseVimmSearch – robust Vimm vault list parser
 * Parser version 1.0.0
 *
 * Handles:
 * - canonical href /vault/{numeric}
 * - semantic labels without relying solely on nth-child
 * - zero results case
 * - availability / takedown detection
 * - thumbnail only if publicly exposed (img src)
 * - No download URL extraction
 * - Throws ParserError when schema changed
 */

import type { DiscoveryResult, ParserError } from '../../types';
import { createParserError } from '../../types';
import { VIMM_PARSER_VERSION_SEARCH } from './types';
import { buildDetailUrl } from './vimmRoutes';

export const PARSER_VERSION = VIMM_PARSER_VERSION_SEARCH;

function makeParserError(
  httpStatus: number,
  message: string,
  selectorHint?: string
): ParserError {
  return createParserError('vimms', 'search', httpStatus, PARSER_VERSION, message, selectorHint);
}

function detectAvailability(text: string): { availability: DiscoveryResult['availability']; isTakedown: boolean } {
  const low = text.toLowerCase();
  if (
    low.includes('no longer available') ||
    low.includes('publisher request') ||
    low.includes('takedown') ||
    low.includes('taken down') ||
    low.includes('dmca')
  ) {
    return { availability: 'takedown', isTakedown: true };
  }
  if (low.includes('download not available') || low.includes('not available') || low.includes('unavailable')) {
    return { availability: 'unavailable', isTakedown: false };
  }
  return { availability: 'available', isTakedown: false };
}

function extractYear(text: string): number | undefined {
  const m = text.match(/\b(19\d{2}|20[0-2]\d|2030)\b/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (!isNaN(y) && y >= 1970 && y <= 2030) return y;
  }
  return undefined;
}

function hasDomParser(): boolean {
  return typeof (globalThis as any).DOMParser !== 'undefined' || typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).window.DOMParser !== 'undefined';
}

function parseWithDom(html: string, crystalSystemId: string, vimmSystemToken: string): DiscoveryResult[] | ParserError {
  // Use DOMParser when available – browser path
  let doc: Document;
  try {
    const Parser = (globalThis as any).DOMParser || (globalThis as any).window?.DOMParser;
    if (!Parser) throw new Error('DOMParser not available');
    const parser = new Parser();
    doc = parser.parseFromString(html, 'text/html') as Document;
  } catch (e) {
    return makeParserError(200, `DOMParser failed: ${(e as Error).message}`, 'DOMParser');
  }

  // Heuristic: find all anchors with /vault/\d+
  const anchors = Array.from(doc.querySelectorAll('a[href*="/vault/"]')) as HTMLAnchorElement[];
  const vaultAnchors = anchors.filter(a => {
    const href = a.getAttribute('href') || '';
    return /\/vault\/\d+/.test(href);
  });

  if (vaultAnchors.length === 0) {
    // Zero results is valid – but check if page looks like a search page vs completely changed schema
    // If page contains "No results" phrase, return empty.
    const bodyText = doc.body?.textContent?.toLowerCase() || '';
    if (bodyText.includes('no results') || bodyText.includes('no games found') || bodyText.includes('0 results')) {
      return [];
    }
    // Also valid when body has vault table but empty – treat as empty if we see list/table header but no rows
    const hasVaultMarkers = html.toLowerCase().includes('vault') || bodyText.includes('vault');
    if (hasVaultMarkers) {
      // Likely zero results
      return [];
    }
    // Otherwise schema changed
    return makeParserError(200, 'Vimm search format changed – no vault anchors found', 'a[href*="/vault/"]');
  }

  const results: DiscoveryResult[] = [];

  for (const a of vaultAnchors) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/vault\/(\d+)/);
    if (!m) continue;
    const id = m[1];
    const titleRaw = (a.textContent || '').trim() || a.getAttribute('title')?.trim() || `Game ${id}`;
    const title = titleRaw.replace(/\s+/g, ' ').trim().slice(0, 200);

    // Locate row container for extra metadata – nearest tr, li, or div with class list
    let row: Element | null = a.closest('tr') || a.closest('li') || a.closest('div');
    let rowText = row?.textContent || a.parentElement?.textContent || '';
    // availability
    const availInfo = detectAvailability(rowText || '');

    // region badge heuristic – look for small span with region codes
    let region: string | undefined;
    const regionEl =
      row?.querySelector?.('.region, .badge, [class*="region"]') ||
      row?.querySelector?.('small') ||
      null;
    if (regionEl?.textContent) {
      const rt = regionEl.textContent.trim().slice(0, 20);
      if (/^(USA|Europe|Japan|World|USA\+Europe|US|EU|JP|UK)$/i.test(rt.replace(/[^A-Za-z\+]/g, ''))) {
        region = rt;
      } else if (rt.length <= 12 && /^[A-Za-z,\s\+]+$/.test(rt)) {
        region = rt; // keep short region-ish
      }
    }

    const year = extractYear(rowText);

    let thumbnailUrl: string | undefined;
    // Only if img src is publicly exposed adjacent to result – avoid anti-bot tricks
    const img = row?.querySelector('img[src]') as HTMLImageElement | null;
    if (img && img.src) {
      // Basic validation – http(s) and vimm.net or static vimm host allowed? Per spec only thumbnail if publicly exposed as img src – we allow any https but prefer vimm.net
      try {
        const u = new URL(img.src, 'https://vimm.net');
        if (u.protocol === 'https:') thumbnailUrl = u.toString().slice(0, 500);
      } catch {
        // ignore
      }
    }

    // rating heuristic
    let rating: string | undefined;
    const ratingMatch = rowText.match(/Rating:\s*([0-9\.\/]+)/i);
    if (ratingMatch) rating = ratingMatch[1].slice(0, 20);

    // disc count heuristic
    let discCount: number | undefined;
    const discMatch = title.match(/\(Disc\s*(\d+)(?:\s*of\s*(\d+))?\)/i) || rowText.match(/(\d+)\s+disc/i);
    if (discMatch && discMatch[1]) {
      const n = parseInt(discMatch[1], 10);
      if (!isNaN(n) && n > 1 && n < 10) discCount = n;
    }

    results.push({
      provider: 'vimms',
      providerId: id,
      systemId: crystalSystemId,
      externalSystem: vimmSystemToken,
      title,
      region,
      year,
      rating,
      externalUrl: buildDetailUrl(id),
      thumbnailUrl,
      availability: availInfo.availability,
      discCount,
    });
  }

  // De-dup by providerId
  const uniq = new Map<string, DiscoveryResult>();
  for (const r of results) uniq.set(r.providerId, r);
  return Array.from(uniq.values());
}

function parseWithRegex(html: string, crystalSystemId: string, vimmSystemToken: string): DiscoveryResult[] | ParserError {
  // Node / test fallback – regex heuristics, no DOM
  // Find all vault ids in html
  const vaultRe = /href=["']\/vault\/(\d+)["'][^>]*>([^<]{1,200}?)<\/a>/gi;
  const matches: { id: string; title: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = vaultRe.exec(html)) !== null) {
    const id = m[1];
    const titleRaw = m[2].trim().replace(/\s+/g, ' ');
    matches.push({ id, title: titleRaw.slice(0, 200), index: m.index });
  }

  if (matches.length === 0) {
    const lower = html.toLowerCase();
    if (lower.includes('no results') || lower.includes('no games found') || lower.includes('0 results')) {
      return [];
    }
    if (lower.includes('/vault/')) {
      // fallback generic /vault/(\d+) without anchor text constraints
      const gen = /\/vault\/(\d+)/g;
      const seen = new Set<string>();
      let g: RegExpExecArray | null;
      while ((g = gen.exec(html)) !== null) {
        const id = g[1];
        if (seen.has(id)) continue;
        seen.add(id);
        matches.push({ id, title: `Game ${id}`, index: g.index });
      }
      if (matches.length === 0) {
        return makeParserError(200, 'Vimm search format changed – regex found no vault entries', 'href="/vault/{id}"');
      }
    } else {
      // zero results case might still have no vault links
      if (lower.includes('vault')) return [];
      return makeParserError(200, 'Vimm search format changed – no vault patterns in HTML', '/vault/{id}');
    }
  }

  const results: DiscoveryResult[] = matches.map(({ id, title }) => {
    // Slice around match for context (500 chars after) to infer year/availability
    const pos = html.indexOf(`/vault/${id}`);
    const ctx = pos >= 0 ? html.slice(pos, pos + 800) : '';
    const avail = detectAvailability(ctx);
    const year = extractYear(ctx);

    // thumbnail regex – img src near
    let thumb: string | undefined;
    const imgRe = new RegExp(`\\/vault\\/${id}[^<]{0,400}<img[^>]+src=["']([^"']+)["']|<img[^>]+src=["']([^"']+)["'][^>]{0,400}\\/vault\\/${id}`, 'i');
    const imgM = ctx.match(imgRe) || html.slice(Math.max(0, pos - 400), pos + 800).match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgM) {
      const candidate = imgM[1] || imgM[2];
      if (candidate) {
        try {
          const u = new URL(candidate, 'https://vimm.net');
          if (u.protocol === 'https:') thumb = u.toString().slice(0, 500);
        } catch {}
      }
    }

    return {
      provider: 'vimms',
      providerId: id,
      systemId: crystalSystemId,
      externalSystem: vimmSystemToken,
      title: title || `Game ${id}`,
      year,
      externalUrl: buildDetailUrl(id),
      thumbnailUrl: thumb,
      availability: avail.availability,
    };
  });

  const uniq = new Map<string, DiscoveryResult>();
  for (const r of results) if (!uniq.has(r.providerId)) uniq.set(r.providerId, r);
  return Array.from(uniq.values());
}

export function detectSchemaChange(html: string): boolean {
  // Basic heuristic – if HTML length very small or lacks expected vault markers and also lacks "No results", treat as schema change
  if (!html || html.length < 300) return true;
  const low = html.toLowerCase();
  if (!low.includes('vault') && !low.includes('vimm')) return true;
  return false;
}

export function parseVimmSearch(
  html: string,
  crystalSystemId: string,
  vimmSystemToken: string
): DiscoveryResult[] {
  if (!html || typeof html !== 'string') {
    throw makeParserError(200, 'Empty or invalid HTML passed to parseVimmSearch', 'html non-empty');
  }

  // DOM path preferred in browser env
  if (hasDomParser()) {
    const resOrErr = parseWithDom(html, crystalSystemId, vimmSystemToken);
    if (Array.isArray(resOrErr)) return resOrErr;
    // if ParserError – throw to let caller handle structured error
    throw resOrErr;
  }

  // Fallback regex
  if (detectSchemaChange(html) && !html.toLowerCase().includes('no results')) {
    // still try regex – schema detection is weak, but if zero length it is error
    if (html.length < 200) throw makeParserError(200, 'Search page schema appears changed or empty', 'html length <200');
  }

  const out = parseWithRegex(html, crystalSystemId, vimmSystemToken);
  if (Array.isArray(out)) return out;
  throw out; // ParserError
}
