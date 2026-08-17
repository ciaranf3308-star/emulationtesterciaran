import { describe, expect, it } from 'bun:test'
import { dedupeLibraryGames } from '../src/lib/dedupeLibraryGames'

const game = (id:string,name:string,extension:string,extra:any={}) => ({ id, name, extension, system_id:'dreamcast', rom_path:id, rom_basename:name, ...extra }) as any

describe('daily-driver library dedupe', () => {
  it('collapses identical display titles and prefers extracted playable media', () => {
    const result = dedupeLibraryGames([game('archive','Jet Grind Radio','.7z'),game('disc','Jet Grind Radio','.gdi',{description:'real'})])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('disc')
  })
  it('does not collapse distinct region-labelled titles', () => {
    expect(dedupeLibraryGames([game('a','Game (USA)','.iso'),game('b','Game (Europe)','.iso')])).toHaveLength(2)
  })
})
