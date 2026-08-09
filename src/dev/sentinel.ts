// @ts-nocheck
/**
 * Crystal Sentinel – TypeScript wrapper for dev UI
 * Provides typed helpers for snapshot/diff when running inside Tauri devtools.
 * Pure read-only – does not write EmuDeck/ES-DE.
 * For CLI use, run `node tools/sentinel.mjs snapshot`
 */

export type SentinelTarget = {
  id: string;
  path: string;
  exists?: boolean;
  isFile?: boolean;
  isDir?: boolean;
  mtimeMs?: number;
  mtimeIso?: string;
  size?: number;
  fileCount?: number | null;
  category?: string;
  system?: string;
  note?: string;
};

export type SentinelSnapshot = {
  generatedAt: string;
  host: string;
  configUsed: any;
  targets: SentinelTarget[];
  env?: Record<string,string|null>;
};

export type SentinelDiff = {
  beforeAt: string;
  afterAt: string;
  totalBefore: number;
  totalAfter: number;
  changes: Array<{ type: string; key: string; id?: string; path?: string; mtimeDelta?: number; sizeChanged?: boolean; before?: any; after?: any }>;
  unexpected: any[];
  unexpectedCount: number;
};

export function isTauri() {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

/**
 * In Tauri, invokes backend sentinel if compiled as Rust (future), otherwise
 * uses plugin-fs to read previously written sentinel JSON from app-cache.
 */
export async function loadLatestSentinelFromCache(): Promise<SentinelSnapshot|null> {
  if (!isTauri()) return null;
  try {
    const mod = await import('@tauri-apps/plugin-fs') as any;
    // Try LOCALAPPDATA/CrystalFrontend/cache/sentinel-before.json via known paths
    // We can't resolve $LOCALAPPDATA directly in JS, but Tauri path plugin can.
    const pathMod = await import('@tauri-apps/api/path') as any;
    const localAppData = await pathMod.localDataDir(); // e.g. C:\Users\…\AppData\Local
    const sentinelPath = localAppData.replace(/\\/g,'/') + '/CrystalFrontend/cache/sentinel-before.json';
    const txt = await mod.readTextFile(sentinelPath);
    return JSON.parse(txt) as SentinelSnapshot;
  } catch {
    return null;
  }
}

/**
 * Diff two snapshots client-side – same logic as tools/sentinel.mjs
 */
export function diffSnapshotsClient(before: SentinelSnapshot, after: SentinelSnapshot): SentinelDiff {
  const MTIME_TOL = 1500;
  const beforeMap = new Map(before.targets.map(t=>[(t.id+'::'+t.path), t] as const));
  const afterMap = new Map(after.targets.map(t=>[(t.id+'::'+t.path), t] as const));
  const changes: any[] = [];
  for (const [key,a] of afterMap){
    const b = beforeMap.get(key) as any;
    if (!b) { changes.push({ type:'added', key, after:a }); continue; }
    if (b.exists !== a.exists){ changes.push({ type:'existence-changed', key, before:b, after:a, id:b.id, path:b.path }); continue; }
    if (!b.exists && !a.exists) continue;
    const delta = Math.abs((a.mtimeMs||0)-(b.mtimeMs||0));
    const sizeDiff = (a.size||0)!==(b.size||0);
    if (delta>MTIME_TOL || sizeDiff){
      changes.push({ type:'modified', key, id:b.id, path:b.path, mtimeDelta:delta, sizeChanged:sizeDiff, before:{mtimeMs:b.mtimeMs,size:b.size}, after:{mtimeMs:a.mtimeMs,size:a.size,fileCount:a.fileCount} });
    } else if (b.fileCount!=null && a.fileCount!=null && b.fileCount!==a.fileCount){
      changes.push({ type:'count-changed', key, id:b.id, path:b.path, before:b, after:a });
    }
  }
  for (const [key,b] of beforeMap){
    if (!afterMap.has(key) && (b as any).exists) changes.push({ type:'removed', key, before:b, id:(b as any).id, path:(b as any).path });
  }
  const unexpected = changes.filter(c=> !(c.path||'').includes('CrystalFrontend') && !(c.path||'').includes('Crystal Frontend') && !(c.id||'').startsWith('crystal:'));
  return { beforeAt:before.generatedAt, afterAt:after.generatedAt, totalBefore:before.targets.length, totalAfter:after.targets.length, changes, unexpected, unexpectedCount:unexpected.length };
}

/**
 * CLI helper – call when wiring to Crystal DevTools panel:
 *  - "Take Before Snapshot" -> runs `cargo run -- sentinel` or `node tools/sentinel.mjs snapshot`
 *  - "Verify No External Changes" -> loads before & current snapshot, diffs, reports
 */
