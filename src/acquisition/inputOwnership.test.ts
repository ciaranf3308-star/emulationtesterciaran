import { describe, expect, it } from 'vitest'
import { acquisitionOwnsConfirm } from './inputOwnership'

describe('acquisition input ownership', () => {
  it('never swallows PLAY in the library, including stale download phases', () => {
    expect(acquisitionOwnsConfirm('library', 'WAITING_FOR_DOWNLOAD')).toBe(false)
    expect(acquisitionOwnsConfirm('library', 'FAILED')).toBe(false)
  })

  it('continues to protect an active Discover acquisition flow', () => {
    expect(acquisitionOwnsConfirm('discover', 'WAITING_FOR_DOWNLOAD')).toBe(true)
    expect(acquisitionOwnsConfirm('discover', 'FAILED')).toBe(true)
  })
})
