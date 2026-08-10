import { isSafeCachePath } from './cache';

export function isSafeWriteInsideRoot(root: string, target: string): boolean {
  return isSafeCachePath(root, target);
}

export function assertSafeCacheWrite(root: string, target: string): void {
  if (!isSafeWriteInsideRoot(root, target)) {
    throw new Error(`Unsafe cache write – target '${target}' not inside root '${root}' or traversal/ROM marker detected`);
  }
}

// Re-export from cache for compatibility
export { isSafeCachePath } from './cache';
