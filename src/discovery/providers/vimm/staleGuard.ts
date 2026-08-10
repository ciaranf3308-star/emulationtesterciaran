export class StaleQueryGuard {
  private seq = 0;
  private cur = 0;
  next(): number {
    this.seq++;
    this.cur = this.seq;
    return this.seq;
  }
  current(): number { return this.cur; }
  isStale(token: number): boolean { return token !== this.cur; }
  isCurrent(token: number): boolean { return token === this.cur; }
  shouldAbort(token: number): boolean { return this.isStale(token); }
}

export function createStaleGuard(): StaleQueryGuard {
  return new StaleQueryGuard();
}
