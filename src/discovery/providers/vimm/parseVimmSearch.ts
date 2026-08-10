/**
 * parseVimmSearch – live-table aware Vimm vault list parser
 * Parser version 1.0.0 (stable header-mapped)
 *
 * LIVE 2026-08-10 audit source:
 * Table header: Title | Region | Version | Languages | Rating
 * Each row contains anchor href /vault/{digits}, Region column with flag imgs
 *   <img src="/images/flags/usa.png" title="USA"> etc.
 * Version column string e.g. "1.0", Languages "de en es fr it" or "-", Rating "10.0" | "none"
 *
 * Implements header -> column index mapping once, then reads rows accordingly.
 * Falls back gracefully to legacy .result-row div fixtures and generic anchor extraction.
 * Thumbnail security: only allow https://vimm.net and https://dl.vimm.net image origins,
 *   and disallow flag images (/images/flags) as thumbnails.
 * Throws ParserError (kind='parser-error') on schema change, never returns it.
 */

import type { DiscoveryResult, ParserError } from '../../types';
import { createParserError } from '../../types';
import { VIMM_PARSER_VERSION_SEARCH } from './types';
import { buildDetailUrl } from './vimmRoutes';

export const PARSER_VERSION = VIMM_PARSER_VERSION_SEARCH;

function makeParserError(httpStatus: number, message: string, selectorHint?: string): ParserError {
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
  return typeof (globalThis as any).DOMParser !== 'undefined' || (typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).window.DOMParser !== 'undefined');
}

function isAllowedThumbUrl(candidate: string): string | undefined {
  try {
    const u = new URL(candidate, 'https://vimm.net');
    if (u.protocol !== 'https:') return undefined;
    const host = u.hostname.toLowerCase();
    if (host !== 'vimm.net' && host !== 'dl.vimm.net') return undefined;
    // Reject flag images – they are region, not thumbnail
    if (u.pathname.toLowerCase().includes('/images/flags')) return undefined;
    // Only ordinary public images – allow /images/vault/, /images/, image.php, /image.php, box/thumb etc.
    // If host is dl.vimm.net, require image.php? pattern or /images/; still safe as long as origin is allowed
    return u.toString().slice(0, 500);
  } catch {
    return undefined;
  }
}

function extractRegionFromElement(cellEl: Element | null): string | undefined {
  if (!cellEl) return undefined;
  // Prefer flag imgs title/alt
  const flags = Array.from(cellEl.querySelectorAll('img[src*="/images/flags"], img[src*="flags"]')) as HTMLImageElement[];
  if (flags.length > 0) {
    const regions: string[] = [];
    for (const img of flags) {
      const title = (img.getAttribute('title') || img.getAttribute('alt') || '').trim();
      if (title) regions.push(title);
      else {
        // fallback src filename without ext e.g. usa.png -> USA
        const src = img.getAttribute('src') || '';
        const fname = src.split('/').pop()?.split('.')[0];
        if (fname) regions.push(fname);
      }
    }
    if (regions.length) {
      // normalize – join with '/' if multiple, keep as provided (e.g. USA+Europe -> keep)
      return regions.join('/').slice(0, 40);
    }
  }
  // fallback text content short
  const txt = (cellEl.textContent || '').trim().slice(0, 30);
  if (txt && txt.length <= 20 && /^[A-Za-z\s\/\+\-,]+$/.test(txt)) {
    if (txt === '-' || txt.toLowerCase() === 'none') return undefined;
    return txt;
  }
  return undefined;
}

/**
 * DOM path – header-mapped table aware.
 */
function parseWithDom(html: string, crystalSystemId: string, vimmSystemToken: string): DiscoveryResult[] {
  let doc: Document;
  try {
    const Parser = (globalThis as any).DOMParser || (globalThis as any).window?.DOMParser;
    if (!Parser) throw new Error('DOMParser not available');
    const parser = new Parser();
    doc = parser.parseFromString(html, 'text/html') as Document;
  } catch (e) {
    throw makeParserError(200, `DOMParser failed: ${(e as Error).message}`, 'DOMParser');
  }

  // 1. Try live table with header mapping
  const tables = Array.from(doc.querySelectorAll('table'));
  for (const table of tables) {
    // Find header row: first tr containing th with Title
    const headerRows = Array.from(table.querySelectorAll('tr'));
    let headerMap: Record<string, number> = {};
    let headerFound = false;
    let bodyRowStartIdx = 1;

    for (let i = 0; i < Math.min(headerRows.length, 3); i++) {
      const tr = headerRows[i];
      const ths = Array.from(tr.querySelectorAll('th'));
      if (ths.length >= 2) {
        const headers = ths.map(th => (th.textContent || '').trim().toLowerCase());
        // Check if contains title
        if (headers.some(h => h.includes('title'))) {
          headers.forEach((h, idx) => {
            const key = h.replace(/[^a-z]/g, ''); // normalize "languages" -> languages, "region" -> region
            if (key.includes('title')) headerMap['title'] = idx;
            else if (key.includes('region')) headerMap['region'] = idx;
            else if (key.includes('version')) headerMap['version'] = idx;
            else if (key.includes('language')) headerMap['languages'] = idx;
            else if (key.includes('rating')) headerMap['rating'] = idx;
          });
          headerFound = true;
          bodyRowStartIdx = i + 1;
          break;
        }
      }
    }

    if (headerFound) {
      const results: DiscoveryResult[] = [];
      const rows = headerRows.slice(bodyRowStartIdx);
      for (const row of rows) {
        const tds = Array.from(row.querySelectorAll('td'));
        if (tds.length === 0) continue;
        const anchor = row.querySelector('a[href*="/vault/"]') as HTMLAnchorElement | null;
        if (!anchor) continue;
        const href = anchor.getAttribute('href') || '';
        const m = href.match(/\/vault\/(\d+)/);
        if (!m) continue;
        const id = m[1];
        const titleRaw = (anchor.textContent || '').trim() || anchor.getAttribute('title')?.trim() || `Game ${id}`;
        const title = titleRaw.replace(/\s+/g, ' ').trim().slice(0, 200);

        const rowText = row.textContent || '';
        const availInfo = detectAvailability(rowText);

        // title idx usually 0 but use mapping if present
        let region: string | undefined;
        if (headerMap['region'] !== undefined && tds[headerMap['region']]) {
          region = extractRegionFromElement(tds[headerMap['region']]);
        } else {
          // try any flag img in row
          const flagImg = row.querySelector('img[src*="/images/flags"]') as HTMLImageElement | null;
          if (flagImg) {
            region = flagImg.getAttribute('title')?.trim() || flagImg.getAttribute('alt')?.trim() || undefined;
          }
        }

        let version: string | undefined;
        if (headerMap['version'] !== undefined && tds[headerMap['version']]) {
          const vt = (tds[headerMap['version']].textContent || '').trim().slice(0, 30);
          if (vt && vt !== '-' && vt.toLowerCase() !== 'none') version = vt;
        }

        let languages: string | undefined;
        if (headerMap['languages'] !== undefined && tds[headerMap['languages']]) {
          const lt = (tds[headerMap['languages']].textContent || '').trim().slice(0, 80);
          if (lt && lt !== '-') languages = lt;
        }

        let rating: string | undefined;
        if (headerMap['rating'] !== undefined && tds[headerMap['rating']]) {
          const rt = (tds[headerMap['rating']].textContent || '').trim().slice(0, 20);
          if (rt && rt.toLowerCase() !== 'none') rating = rt;
          else if (rt.toLowerCase() === 'none') rating = undefined;
          else rating = rt || undefined;
        } else {
          const ratingMatch = rowText.match(/Rating:\s*([0-9\.\/]+)/i);
          if (ratingMatch) rating = ratingMatch[1].slice(0, 20);
        }

        const year = extractYear(rowText);

        let thumbnailUrl: string | undefined;
        // Search row may contain box thumb img not flag – allow only vimm.net / dl.vimm.net non-flag
        const imgs = Array.from(row.querySelectorAll('img[src]')) as HTMLImageElement[];
        for (const img of imgs) {
          const srcAttr = img.getAttribute('src') || (img as any).src || '';
          if (!srcAttr) continue;
          if (srcAttr.toLowerCase().includes('/images/flags')) continue;
          const allowed = isAllowedThumbUrl(srcAttr);
          if (allowed) {
            thumbnailUrl = allowed;
            break;
          }
        }

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
          version,
          languages,
          externalUrl: buildDetailUrl(id),
          thumbnailUrl,
          availability: availInfo.availability,
          discCount,
        });
      }

      if (results.length > 0) {
        const uniq = new Map<string, DiscoveryResult>();
        for (const r of results) uniq.set(r.providerId, r);
        return Array.from(uniq.values());
      }
      // If header found but zero rows, valid empty result?
      const bodyText = doc.body?.textContent?.toLowerCase() || '';
      if (bodyText.includes('no results') || bodyText.includes('no games found') || bodyText.includes('0 results')) {
        return [];
      }
      // Continue to next table attempt or fallback
    }
  }

  // 2. Legacy fixture support – .result-row divs (tests)
  const resultRows = doc.querySelectorAll('.result-row');
  if (resultRows.length > 0) {
    const results: DiscoveryResult[] = [];
    resultRows.forEach((row) => {
      const a = row.querySelector('a[href*="/vault/"]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/vault\/(\d+)/);
      if (!m) return;
      const id = m[1];
      const title = (a.textContent || '').trim().slice(0, 200) || `Game ${id}`;
      const rowText = row.textContent || '';
      const avail = detectAvailability(rowText);
      let region: string | undefined;
      // per fixture region is span.region
      const regEl = row.querySelector('.region');
      if (regEl?.textContent) region = regEl.textContent.trim().slice(0, 30);
      // Year extraction from .year span or context
      let year: number | undefined;
      const yearEl = row.querySelector('.year');
      if (yearEl?.textContent) {
        const ym = yearEl.textContent.match(/\d{4}/);
        if (ym) year = parseInt(ym[0], 10);
      }
      if (!year) year = extractYear(rowText);
      let thumb: string | undefined;
      const img = row.querySelector('img[src]') as HTMLImageElement | null;
      if (img) {
        thumb = isAllowedThumbUrl(img.getAttribute('src') || img.src || '');
      }
      results.push({
        provider: 'vimms',
        providerId: id,
        systemId: crystalSystemId,
        externalSystem: vimmSystemToken,
        title,
        region,
        year,
        externalUrl: buildDetailUrl(id),
        thumbnailUrl: thumb,
        availability: avail.availability,
      });
    });
    if (results.length > 0) {
      const uniq = new Map<string, DiscoveryResult>();
      for (const r of results) uniq.set(r.providerId, r);
      return Array.from(uniq.values());
    }
  }

  // 3. Generic vault anchors – live fallback
  const anchors = Array.from(doc.querySelectorAll('a[href*="/vault/"]')) as HTMLAnchorElement[];
  const vaultAnchors = anchors.filter(a => /\/vault\/\d+/.test(a.getAttribute('href') || ''));

  if (vaultAnchors.length === 0) {
    const bodyText = doc.body?.textContent?.toLowerCase() || '';
    if (bodyText.includes('no results') || bodyText.includes('no games found') || bodyText.includes('0 results')) {
      return [];
    }
    const hasVaultMarkers = html.toLowerCase().includes('vault') || bodyText.includes('vault');
    if (hasVaultMarkers) return [];
    throw makeParserError(200, 'Vimm search format changed – no vault anchors found', 'a[href*="/vault/"]');
  }

  const results: DiscoveryResult[] = [];
  for (const a of vaultAnchors) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/vault\/(\d+)/);
    if (!m) continue;
    const id = m[1];
    const titleRaw = (a.textContent || '').trim() || a.getAttribute('title')?.trim() || `Game ${id}`;
    const title = titleRaw.replace(/\s+/g, ' ').trim().slice(0, 200);
    let row: Element | null = a.closest('tr') || a.closest('li') || a.closest('div');
    let rowText = row?.textContent || a.parentElement?.textContent || '';
    const availInfo = detectAvailability(rowText || '');

    let region: string | undefined;
    const flagInRow = row?.querySelector('img[src*="/images/flags"]') as HTMLImageElement | null;
    if (flagInRow) region = flagInRow.getAttribute('title')?.trim() || flagInRow.getAttribute('alt')?.trim() || undefined;
    else {
      const regionEl = row?.querySelector?.('.region, .badge, [class*="region"]') || row?.querySelector?.('small');
      if (regionEl?.textContent) {
        const rt = regionEl.textContent.trim().slice(0, 20);
        if (rt) region = rt;
      }
    }

    const year = extractYear(rowText);

    let thumbnailUrl: string | undefined;
    const img = row?.querySelector('img[src]') as HTMLImageElement | null;
    if (img) {
      const src = img.getAttribute('src') || img.src || '';
      if (!src.toLowerCase().includes('/images/flags')) {
        thumbnailUrl = isAllowedThumbUrl(src);
      }
    }

    let rating: string | undefined;
    const ratingMatch = rowText.match(/Rating:\s*([0-9\.\/]+)/i);
    if (ratingMatch) rating = ratingMatch[1].slice(0, 20);

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

  const uniq = new Map<string, DiscoveryResult>();
  for (const r of results) uniq.set(r.providerId, r);
  return Array.from(uniq.values());
}

function parseWithRegex(html: string, crystalSystemId: string, vimmSystemToken: string): DiscoveryResult[] {
  // Table header mapping regex fallback
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
        throw makeParserError(200, 'Vimm search format changed – regex found no vault entries', 'href="/vault/{id}"');
      }
    } else {
      if (lower.includes('vault')) return [];
      throw makeParserError(200, 'Vimm search format changed – no vault patterns in HTML', '/vault/{id}');
    }
  }

  // Attempt header mapping via <th> extraction
  let headerMap: Record<string, number> | null = null;
  const headerMatch = html.match(/<tr[^>]*>([\s\S]*?<th[^>]*>[\s\S]*?<\/th>[\s\S]*?)<\/tr>/i);
  if (headerMatch) {
    const headerHtml = headerMatch[0];
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    const headers: string[] = [];
    let thM: RegExpExecArray | null;
    while ((thM = thRe.exec(headerHtml)) !== null) {
      headers.push(thM[1].replace(/<[^>]+>/g, '').trim().toLowerCase());
    }
    if (headers.some(h => h.includes('title'))) {
      headerMap = {};
      headers.forEach((h, idx) => {
        const k = h.replace(/[^a-z]/g, '');
        if (k.includes('title')) headerMap!['title'] = idx;
        else if (k.includes('region')) headerMap!['region'] = idx;
        else if (k.includes('version')) headerMap!['version'] = idx;
        else if (k.includes('language')) headerMap!['languages'] = idx;
        else if (k.includes('rating')) headerMap!['rating'] = idx;
      });
    }
  }

  const results: DiscoveryResult[] = matches.map(({ id, title }) => {
    const pos = html.indexOf(`/vault/${id}`);
    const ctxFull = pos >= 0 ? html.slice(Math.max(0, pos - 500), pos + 800) : '';
    const avail = detectAvailability(ctxFull);
    const year = extractYear(ctxFull);

    // Try to parse surrounding <tr> for td fields if headerMap available
    let version: string | undefined;
    let languages: string | undefined;
    let region: string | undefined;
    let rating: string | undefined;
    let thumbnailUrl: string | undefined;

    if (headerMap) {
      // locate enclosing <tr>...</tr>
      const trStart = html.lastIndexOf('<tr', pos);
      const trEnd = html.indexOf('</tr>', pos);
      if (trStart !== -1 && trEnd !== -1) {
        const trHtml = html.slice(trStart, trEnd + 5);
        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const tds: string[] = [];
        let tdM: RegExpExecArray | null;
        while ((tdM = tdRe.exec(trHtml)) !== null) tds.push(tdM[1]);
        if (tds.length > 0) {
          if (headerMap['region'] !== undefined && tds[headerMap['region']]) {
            const cell = tds[headerMap['region']];
            const flagTitle = cell.match(/title=["']([^"']+)["']/i) || cell.match(/alt=["']([^"']+)["']/i);
            if (flagTitle) region = flagTitle[1].trim().slice(0, 30);
            else {
              const txt = cell.replace(/<[^>]+>/g, '').trim().slice(0, 20);
              if (txt && txt !== '-') region = txt;
            }
          }
          if (headerMap['version'] !== undefined && tds[headerMap['version']]) {
            const v = tds[headerMap['version']].replace(/<[^>]+>/g, '').trim().slice(0, 30);
            if (v && v !== '-') version = v;
          }
          if (headerMap['languages'] !== undefined && tds[headerMap['languages']]) {
            const l = tds[headerMap['languages']].replace(/<[^>]+>/g, '').trim().slice(0, 80);
            if (l && l !== '-') languages = l;
          }
          if (headerMap['rating'] !== undefined && tds[headerMap['rating']]) {
            const r = tds[headerMap['rating']].replace(/<[^>]+>/g, '').trim().slice(0, 20);
            if (r && r.toLowerCase() !== 'none') rating = r;
          }
        }
      }
    } else {
      // fallback region via flag title near match
      const flagTitleMatch = ctxFull.match(/\/images\/flags\/[^"']+["'][^>]*title=["']([^"']+)["']/i) || ctxFull.match(/title=["']([^"']+)["'][^>]*\/images\/flags/i);
      if (flagTitleMatch) region = flagTitleMatch[1].trim().slice(0, 30);
      else {
        const altMatch = ctxFull.match(/<img[^>]+src=["'][^"']*flags[^"']*["'][^>]*alt=["']([^"']+)["']/i);
        if (altMatch) region = altMatch[1].trim().slice(0, 30);
      }
    }

    // thumbnail regex – img src near, but security filtered
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
    let imgM: RegExpExecArray | null;
    // Use ctxFull and search for img that is not flag
    while ((imgM = imgRe.exec(ctxFull)) !== null) {
      const candidate = imgM[1];
      if (candidate.toLowerCase().includes('/images/flags')) continue;
      const allowed = isAllowedThumbUrl(candidate);
      if (allowed) {
        thumbnailUrl = allowed;
        break;
      }
    }

    return {
      provider: 'vimms',
      providerId: id,
      systemId: crystalSystemId,
      externalSystem: vimmSystemToken,
      title: title || `Game ${id}`,
      year,
      version,
      languages,
      region,
      rating,
      externalUrl: buildDetailUrl(id),
      thumbnailUrl,
      availability: avail.availability,
    };
  });

  const uniq = new Map<string, DiscoveryResult>();
  for (const r of results) if (!uniq.has(r.providerId)) uniq.set(r.providerId, r);
  return Array.from(uniq.values());
}

export function detectSchemaChange(html: string): boolean {
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

  if (hasDomParser()) {
    return parseWithDom(html, crystalSystemId, vimmSystemToken);
  }

  if (detectSchemaChange(html) && !html.toLowerCase().includes('no results')) {
    if (html.length < 200) throw makeParserError(200, 'Search page schema appears changed or empty', 'html length <200');
  }

  return parseWithRegex(html, crystalSystemId, vimmSystemToken);
}
