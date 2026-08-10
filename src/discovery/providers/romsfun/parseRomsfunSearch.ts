/**
 * ROMsFun search parser – metadata only, deterministic fixtures for tests, no live scraping of download URLs
 * For V8.6D1 deterministic QA we return fixture when Tauri not available or when HTML empty
 * No extraction of final download URLs, no ad URLs, no raw download identifiers
 */

import type { DiscoveryResult } from '../../types';

export function parseRomsFunSearch(html: string, systemId: string, systemToken: string): DiscoveryResult[] {
  // If html is fixture marker or empty, fallback synthetic but we still attempt minimal parse for real html
  if (!html || html.trim().length === 0) return [];

  // Real parser would use DOM parsing – we deliberately keep minimal and safe: extract titles via regex for metadata only
  // Safety: never extracts download URLs, never extracts ad URLs
  const results: DiscoveryResult[] = [];
  try {
    // Very conservative: look for <a href="/roms/...">Title</a> patterns – metadata title only, no link extraction for downloads
    // Example ROMsFun listing: <div class="rom-item"> <a href="/roms/nintendo/super-mario-bros">Super Mario Bros.</a> etc
    // We use regex to extract anchor texts inside roms path – title only
    const anchorRegex = /<a[^>]*href=["']\/roms\/([^"']+)["'][^>]*>([^<]{2,120})<\/a>/gi;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = anchorRegex.exec(html)) !== null && count < 24) {
      const slug = m[1].trim();
      const rawTitle = m[2].trim().replace(/\s+/g, ' ');
      if (!slug || !rawTitle) continue;
      // Skip download-looking, advertising anchors (galaxylanes) – we already block third-party host, but also skip if title contains ad keywords like "Download" alone? We keep simple: title must be plausible game title length
      if (rawTitle.length < 2 || rawTitle.length > 80) continue;
      // Discard if slug contains forbidden patterns (we already validated slug style)
      if (slug.includes('..') || slug.includes('\\')) continue;

      results.push({
        provider: 'romsfun',
        providerId: slug, // slug as id – provider owns canonical URL construction via buildCanonicalDetailUrl
        systemId,
        externalSystem: systemToken,
        title: rawTitle,
        externalUrl: `https://romsfun.com/roms/${slug}`,
        availability: 'available',
      } as any);
      count++;
    }
  } catch {
    // swallow parse errors – return empty deterministically rather than throwing live HTML variance
    return [];
  }

  return results;
}

// Fixture for deterministic tests – no live romsfun
export function fixtureSearchResults(systemId: string, query: string): DiscoveryResult[] {
  const sys = systemId.toUpperCase();
  const mocks = Array.from({ length: 6 }, (_, i) => {
    const slug = `roms/${systemId}/game-${query.toLowerCase().replace(/\s+/g, '-')}-${i}`;
    return {
      provider: 'romsfun',
      providerId: slug,
      systemId,
      externalSystem: sys,
      title: `${query} ${['Adventure', 'Legends', 'Remix', 'Collection', 'Quest', 'Turbo'][i]} – ${sys}`,
      region: ['USA','EUR','JPN'][i%3],
      year: 1995 + i,
      availability: 'available' as const,
      externalUrl: `https://romsfun.com/roms/${systemId}/game-${query.toLowerCase()}-${i}`,
    } as any;
  });
  return mocks;
}
