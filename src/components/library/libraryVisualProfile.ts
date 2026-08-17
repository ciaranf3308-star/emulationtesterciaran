export type LibraryVisualProfile = {
  family: 'cartridge' | 'dual-screen' | 'handheld' | 'disc' | 'arcade'
  accent: string
  accent2: string
  label: string
  concept: string
  listMode: 'spine' | 'channel' | 'blade' | 'pak' | 'disc' | 'tile'
  motion: 'float' | 'pulse' | 'orbit' | 'scan' | 'slide'
}

const profiles: Record<string, LibraryVisualProfile> = {
  n64: { family:'cartridge',accent:'#8b5cff',accent2:'#39e6d0',label:'64-BIT CARTRIDGE ARCHIVE',concept:'Cartridge launch deck',listMode:'pak',motion:'float' },
  genesis: { family:'cartridge',accent:'#ff315f',accent2:'#38d8ff',label:'16-BIT BLAST ARCHIVE',concept:'Blast-processing waveform',listMode:'spine',motion:'slide' },
  megadrive: { family:'cartridge',accent:'#e6353e',accent2:'#f4f4f4',label:'MEGA DRIVE CARTRIDGE WALL',concept:'European cartridge grid',listMode:'spine',motion:'slide' },
  snes: { family:'cartridge',accent:'#8b72ff',accent2:'#d9c8ff',label:'MODE-7 CARTRIDGE ARCHIVE',concept:'Mode-7 perspective deck',listMode:'pak',motion:'float' },
  gba: { family:'handheld',accent:'#ff334f',accent2:'#ffb23f',label:'ADVANCE GAME PAK LIBRARY',concept:'Backlit pixel deck',listMode:'pak',motion:'scan' },
  gbc: { family:'handheld',accent:'#9b59ff',accent2:'#36e5c4',label:'COLOR GAME PAK LIBRARY',concept:'Color-spectrum pixel deck',listMode:'pak',motion:'scan' },
  gb: { family:'handheld',accent:'#91ad46',accent2:'#d2ee82',label:'DOT-MATRIX GAME PAK LIBRARY',concept:'Dot-matrix LCD archive',listMode:'pak',motion:'scan' },
  nds: { family:'dual-screen',accent:'#42a5ff',accent2:'#b9d7ff',label:'DUAL-SCREEN SOFTWARE LIBRARY',concept:'Twin-screen touch deck',listMode:'tile',motion:'pulse' },
  n3ds: { family:'dual-screen',accent:'#ff304d',accent2:'#49c9ff',label:'STEREOSCOPIC SOFTWARE LIBRARY',concept:'Parallax depth theatre',listMode:'tile',motion:'float' },
  gc: { family:'disc',accent:'#7657ff',accent2:'#5ecbff',label:'GAME DISC CUBE ARCHIVE',concept:'Spinning optical cube',listMode:'disc',motion:'orbit' },
  ps2: { family:'disc',accent:'#3e74ff',accent2:'#9b54ff',label:'DVD-ROM TOWER',concept:'Memory-card data stream',listMode:'spine',motion:'pulse' },
  psx: { family:'disc',accent:'#5b82d6',accent2:'#e4b93f',label:'COMPACT DISC MEMORY',concept:'Memory-card slot archive',listMode:'disc',motion:'orbit' },
  psp: { family:'disc',accent:'#54c8ff',accent2:'#9b72ff',label:'UMD MEDIA RAIL',concept:'Widescreen XMB gallery',listMode:'disc',motion:'slide' },
  dreamcast: { family:'disc',accent:'#ff6b35',accent2:'#57d8ff',label:'GD-ROM DREAM LIBRARY',concept:'Dream spiral / VMU pulse',listMode:'disc',motion:'orbit' },
  xbox: { family:'disc',accent:'#70cf32',accent2:'#c8ff7a',label:'DIRECTX GAME VAULT',concept:'Green reactor dashboard',listMode:'blade',motion:'pulse' },
  xbox360: { family:'disc',accent:'#72d83a',accent2:'#f0f4ef',label:'RING OF LIGHT LIBRARY',concept:'Blade dashboard / light ring',listMode:'blade',motion:'orbit' },
  wii: { family:'disc',accent:'#52c9ed',accent2:'#effcff',label:'WII CHANNEL LIBRARY',concept:'Pointer channel wall',listMode:'channel',motion:'float' },
  wiiu: { family:'dual-screen',accent:'#43b8e8',accent2:'#fff',label:'GAMEPAD SECOND-SCREEN LIBRARY',concept:'TV + GamePad signal bridge',listMode:'channel',motion:'pulse' },
  steam: { family:'arcade',accent:'#66c0f4',accent2:'#1a9fff',label:'PC PLAY DECK',concept:'Living-room PC carousel',listMode:'tile',motion:'float' },
}

export function getLibraryVisualProfile(systemId: string): LibraryVisualProfile {
  return profiles[systemId] || { family:'arcade',accent:'#63e7ef',accent2:'#7f8cff',label:'CRYSTAL GAME ARCHIVE',concept:'Crystal archive',listMode:'tile',motion:'float' }
}
