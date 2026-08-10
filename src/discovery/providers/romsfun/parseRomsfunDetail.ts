/**
 * ROMsFun detail parser – metadata only
 * No extraction of final download URLs, no ad URLs, no raw download identifiers
 */

import type { DiscoveryGameDetail } from '../../types';

export function parseRomsFunDetail(html: string, slug: string, systemId?: string): DiscoveryGameDetail {
  // Minimal metadata extraction for D1 – if html empty, return synthetic minimal fixture
  if (!html || html.trim().length === 0) {
    return {
      kind: 'detail',
      provider: 'romsfun',
      providerId: slug,
      systemId: systemId || 'unknown',
      externalSystem: systemId || 'unknown',
      title: `Game ${slug.slice(-12)}`,
      description: 'ROMsFun catalog entry – metadata only, no ROM retrieval. Synthetic.',
      externalUrl: `https://romsfun.com/roms/${slug}`,
      availability: 'available',
    } as any;
  }

  // Attempt title extraction from <h1> or <title>
  let title = slug;
  try {
    const h1Match = html.match(/<h1[^>]*>([^<]{2,120})<\/h1>/i);
    if (h1Match && h1Match[1].trim()) {
      title = h1Match[1].trim().replace(/\s+/g, ' ');
    } else {
      const titleTag = html.match(/<title[^>]*>([^<]{2,120})<\/title>/i);
      if (titleTag && titleTag[1].trim()) {
        title = titleTag[1].trim().replace(/\s+/g, ' ');
      }
    }
  } catch {}

  // Description – conservative meta description only
  let desc: string | undefined;
  try {
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{10,400})["']/i);
    if (metaDesc) desc = metaDesc[1].trim();
    if (!desc) {
      const metaOg = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']{10,400})["']/i);
      if (metaOg) desc = metaOg[1].trim();
    }
  } catch {}

  return {
    kind: 'detail',
    provider: 'romsfun',
    providerId: slug,
    systemId: systemId || 'unknown',
    externalSystem: systemId || 'unknown',
    title,
    description: desc || `ROMsFun catalog entry for ${title} – metadata only, no automated ROM download.`,
    externalUrl: `https://romsfun.com/roms/${slug}`,
    availability: 'available',
  } as any;
}

export function fixtureDetail(slug: string, systemId?: string): DiscoveryGameDetail {
  return {
    kind: 'detail',
    provider: 'romsfun',
    providerId: slug,
    systemId: systemId || 'nes',
    externalSystem: systemId || 'nes',
    title: `Fixture Game ${slug.slice(-8)}`,
    description: 'ROMsFun fixture detail – premium gaming OS QA, metadata only, no ROM download.',
    developer: 'Nintendo',
    publisher: 'Nintendo',
    externalUrl: `https://romsfun.com/roms/${slug}`,
    availability: 'available',
  } as any;
}
