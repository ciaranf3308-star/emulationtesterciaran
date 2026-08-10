/**
 * matcher – conservative local library matching (rich version compatible with both simple and V8.4 spec tests)
 */

import { normalizeForMatching } from './normalize';

export interface LocalGameLike {
  id: string;
  system_id: string;
  name: string;
  rom_basename?: string;
}

export interface VimmCandidate {
  providerId: string;
  title: string;
  systemId?: string;
  _normalizedTitle?: string;
}

export type MatchConfidence = 'exact' | 'high' | 'moderate' | 'no';

export interface MatchResult {
  providerId: string;
  title: string;
  systemId?: string;
  confidence: MatchConfidence;
  inLibrary: boolean;
  matchedGameId?: string;
  reason?: string;
  normalizedLocal?: string;
  normalizedRemote?: string;
}

function getNormalizedLocal(game: LocalGameLike & { _normalizedName?: string; _normalizedBasename?: string }): string {
  if ((game as any)._normalizedName) return (game as any)._normalizedName;
  return normalizeForMatching(game.name || game.rom_basename || '');
}

function getNormalizedRemote(v: VimmCandidate): string {
  if (v._normalizedTitle) return v._normalizedTitle;
  return normalizeForMatching(v.title);
}

export function matchLocalLibrary(
  vimmResult: VimmCandidate & { systemId?: string },
  localGames: LocalGameLike[],
  opts?: { requireSameSystem?: boolean; allowModerate?: boolean }
): MatchResult {
  const requireSameSystem = opts?.requireSameSystem ?? true;
  const allowModerate = opts?.allowModerate ?? false;
  const remoteNorm = getNormalizedRemote(vimmResult);
  if (!remoteNorm) {
    return { providerId: vimmResult.providerId, title: vimmResult.title, systemId: vimmResult.systemId, confidence: 'no', inLibrary: false, reason: 'remote title empty after normalization', normalizedRemote: remoteNorm };
  }
  const remoteSystem = (vimmResult.systemId || '').toLowerCase();

  let candidates = localGames;
  if (requireSameSystem && remoteSystem) {
    candidates = localGames.filter(g => (g.system_id || '').toLowerCase() === remoteSystem);
    if (candidates.length === 0) {
      return { providerId: vimmResult.providerId, title: vimmResult.title, systemId: vimmResult.systemId, confidence: 'no', inLibrary: false, reason: `no local games for system ${remoteSystem}`, normalizedRemote: remoteNorm };
    }
  }

  for (const local of candidates) {
    const localNorm = getNormalizedLocal(local);
    if (!localNorm) continue;
    if (localNorm === remoteNorm) {
      return { providerId: vimmResult.providerId, title: vimmResult.title, systemId: vimmResult.systemId, confidence: 'exact', inLibrary: true, matchedGameId: local.id, reason: 'exact normalized equality', normalizedLocal: localNorm, normalizedRemote: remoteNorm };
    }
  }

  const stripThe = (s: string) => s.replace(/^\s*the\s+/i, '').trim();
  const remoteNoThe = stripThe(remoteNorm);
  for (const local of candidates) {
    const localNorm = getNormalizedLocal(local);
    if (!localNorm) continue;
    if (stripThe(localNorm) === remoteNoThe || stripThe(localNorm) === remoteNorm || localNorm === remoteNoThe) {
      return { providerId: vimmResult.providerId, title: vimmResult.title, systemId: vimmResult.systemId, confidence: 'high', inLibrary: true, matchedGameId: local.id, reason: 'high confidence – article/punctuation variance only', normalizedLocal: localNorm, normalizedRemote: remoteNorm };
    }
  }

  if (allowModerate) {
    for (const local of candidates) {
      const localNorm = getNormalizedLocal(local);
      if (!localNorm) continue;
      const longer = localNorm.length > remoteNorm.length ? localNorm : remoteNorm;
      const shorter = localNorm.length <= remoteNorm.length ? localNorm : remoteNorm;
      if (longer.includes(shorter) && shorter.length >= 4 && (longer.length - shorter.length) <= 6) {
        return { providerId: vimmResult.providerId, title: vimmResult.title, systemId: vimmResult.systemId, confidence: 'moderate', inLibrary: true, matchedGameId: local.id, reason: 'moderate – substring containment with small delta', normalizedLocal: localNorm, normalizedRemote: remoteNorm };
      }
    }
  }

  return { providerId: vimmResult.providerId, title: vimmResult.title, systemId: vimmResult.systemId, confidence: 'no', inLibrary: false, reason: 'no normalized exact/high match (conservative)', normalizedRemote: remoteNorm };
}

export function isInLibrary(v: VimmCandidate & { systemId?: string }, localGames: LocalGameLike[]): boolean {
  const res = matchLocalLibrary(v as any, localGames as any, { requireSameSystem: true, allowModerate: false });
  return res.inLibrary && (res.confidence === 'exact' || res.confidence === 'high');
}

// Batch variant – works with array of VimmCandidate
export function batchMatch(
  vimmResults: (VimmCandidate & { systemId?: string })[],
  localGames: LocalGameLike[],
  opts?: { requireSameSystem?: boolean }
): Map<string, MatchResult> {
  const map = new Map<string, MatchResult>();
  for (const vr of vimmResults) {
    const r = matchLocalLibrary(vr as any, localGames as any, opts as any);
    map.set(vr.providerId, r);
  }
  return map;
}

// Compatibility for lib/discoveryMatching style where isInLibrary signature is (title, systemId, library)
// Provide overload? Keep primary above, but also support string:title overload via wrapper below
// New wrapper for legacy lib API used in DiscoverView (optional)
export function isInLibraryLegacy(discoveryTitle: string, discoverySystemId: string | undefined, library: any[]): boolean {
  return isInLibrary({ providerId: discoveryTitle, title: discoveryTitle, systemId: discoverySystemId } as any, library as any);
}
