import { getLibraryVisualProfile } from './libraryVisualProfile'

export function ConsoleLibraryAtmosphere({ systemId }: { systemId: string }) {
  const p = getLibraryVisualProfile(systemId)
  const common = { position:'absolute' as const, pointerEvents:'none' as const }
  const motifs: Record<string, JSX.Element> = {
    gb: <><div className="motif dot-matrix"/><div className="motif lcd-battery">BATTERY&nbsp;&nbsp;■■■■</div></>,
    gbc: <><div className="motif color-bars"/><div className="motif pixel-cross">✚</div></>,
    gba: <><div className="motif advance-grid"/><div className="motif shoulder-line">L&nbsp;&nbsp;&nbsp;GAME PAK&nbsp;&nbsp;&nbsp;R</div></>,
    nds: <><div className="motif ds-hinge"/><div className="motif touch-radar">TOUCH</div></>,
    n3ds: <><div className="motif depth-lines"/><div className="motif depth-meter">3D<br/>DEPTH</div></>,
    n64: <><div className="motif n64-polygons"/><div className="motif cart-slot">INSERT PAK</div></>,
    snes: <><div className="motif mode7-plane"/><div className="motif snes-buttons">● ● ● ●</div></>,
    genesis: <><div className="motif blast-wave"/><div className="motif sixteen-bit">16-BIT</div></>,
    megadrive: <><div className="motif mega-ring"/><div className="motif mega-speed">MEGA<br/>DRIVE</div></>,
    gc: <><div className="motif cube-wire"/><div className="motif disc-orbit">◉</div></>,
    dreamcast: <><div className="motif dream-spiral">◉</div><div className="motif vmu-window">VMU</div></>,
    psx: <><div className="motif ps-grid"/><div className="motif memory-card">MEMORY CARD<br/>1&nbsp;&nbsp;&nbsp;&nbsp;2</div></>,
    ps2: <><div className="motif blue-towers"/><div className="motif ps2-data">DATA STREAM // 128 BIT</div></>,
    psp: <><div className="motif xmb-wave"/><div className="motif umd-ring">UMD</div></>,
    xbox: <><div className="motif xbox-reactor">X</div><div className="motif xbox-data">SYSTEM LINK</div></>,
    xbox360: <><div className="motif ring-light"/><div className="motif blade-lines"/></>,
    wii: <><div className="motif channel-grid"/><div className="motif pointer">◆</div></>,
    wiiu: <><div className="motif signal-arcs"/><div className="motif gamepad-link">TV&nbsp;)))&nbsp;GAMEPAD</div></>,
    steam: <><div className="motif steam-nodes"/><div className="motif pc-status">ONLINE // BIG PICTURE</div></>,
  }
  return <div className={`console-atmosphere system-${systemId} motion-${p.motion}`} style={{...common,inset:0,color:p.accent}} aria-hidden>{motifs[systemId] || <div className="motif crystal-orbit"/>}</div>
}
