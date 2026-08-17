import { useMemo } from 'react'
import { configForSystem } from '../stage'

type Props = {
  theme: 'light' | 'dark'
  systemId: string
  visible: boolean
  onClose: () => void
}

/**
 * Diagnostics Debug Overlay – L+R+View chord
 * Shows safe insets per system (uiSafe top/bottom/left/right % from stage config)
 * plus foregroundZIndex, mediaZIndex, gameplayRegions, physicalMedia placement.
 * Graphite / silver / cyan gaming OS aesthetic – not boutique.
 */
export function DiagnosticsDebugOverlay({ theme, systemId, visible, onClose }: Props) {
  const isDark = theme === 'dark'

  const cfg = useMemo(() => {
    try {
      return configForSystem(systemId, systemId) as any
    } catch {
      return null
    }
  }, [systemId])

  if (!visible) return null

  const uiSafe = cfg?.uiSafe || { top: 6, bottom: 14, left: 0, right: 0 }
  const fgZ = cfg?.foregroundZIndex ?? 4
  const mediaZ = cfg?.mediaZIndex ?? 2
  const regions = cfg?.gameplayRegions ?? []
  const physical = cfg?.physicalMediaPlacement || cfg?.physicalMedia || null
  const insertion = cfg?.insertionAnimation || null

  return (
    <div
      role="dialog"
      aria-label="Diagnostics debug overlay"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 45,
        pointerEvents: 'auto',
        background: isDark ? 'rgba(6,10,16,0.72)' : 'rgba(248,250,255,0.64)',
        backdropFilter: 'blur(18px) saturate(1.12)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.12)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(740px, 92vw)',
          maxHeight: '86vh',
          overflowY: 'auto',
          background: isDark
            ? 'linear-gradient(180deg, rgba(18,22,36,0.96), rgba(12,16,26,0.94))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,255,0.94))',
          border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.16)'}`,
          borderRadius: 16,
          boxShadow: isDark
            ? '0 24px 64px rgba(0,0,0,0.56), 0 0 0 1px rgba(125,249,255,0.08) inset'
            : '0 24px 64px rgba(18,26,44,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
          padding: '18px 20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: isDark ? 'rgba(125,249,255,0.14)' : 'rgba(70,130,255,0.12)',
                border: `1px solid ${isDark ? 'rgba(125,249,255,0.22)' : 'rgba(70,130,255,0.18)'}`,
                color: isDark ? '#7df9ff' : '#3a6ee8',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              D
            </span>
            <div>
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                DIAGNOSTICS • DEBUG OVERLAY
              </div>
              <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {systemId.toUpperCase()} • SAFE INSETS & STAGE CALIBRATION
              </div>
            </div>
          </div>
          <button
            data-settings-control
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
              background: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
              cursor: 'pointer',
              fontFamily: 'var(--crystal-mono)',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
              }}
            >
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, marginBottom: 6 }}>UI SAFE INSETS (%)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontFamily: 'var(--crystal-mono)', fontSize: 11 }}>
                <div>
                  <div style={{ opacity: 0.6, fontSize: 9.5 }}>TOP</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{uiSafe.top ?? 0}%</div>
                </div>
                <div>
                  <div style={{ opacity: 0.6, fontSize: 9.5 }}>BOTTOM</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{uiSafe.bottom ?? 0}%</div>
                </div>
                <div>
                  <div style={{ opacity: 0.6, fontSize: 9.5 }}>LEFT</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{uiSafe.left ?? 0}%</div>
                </div>
                <div>
                  <div style={{ opacity: 0.6, fontSize: 9.5 }}>RIGHT</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{uiSafe.right ?? 0}%</div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.58, lineHeight: 1.45 }}>
                Physical Ally controls still require human confirmation; browser automation cannot actuate embedded controller – note.
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: isDark ? 'rgba(125,249,255,0.06)' : 'rgba(70,130,255,0.06)',
                border: `1px solid ${isDark ? 'rgba(125,249,255,0.12)' : 'rgba(70,130,255,0.12)'}`,
              }}
            >
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.7, marginBottom: 6 }}>Z-INDEX LAYERS</div>
              <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--crystal-mono)', fontSize: 11 }}>
                <div>
                  <span style={{ opacity: 0.6 }}>foregroundZIndex</span> <strong>{fgZ}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>mediaZIndex</span> <strong>{mediaZ}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>stage</span> <strong>{cfg?.presentationType || 'handheld'}</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
              }}
            >
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, marginBottom: 6 }}>PHYSICAL MEDIA</div>
              {physical ? (
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, lineHeight: 1.5 }}>
                  <div>type: <strong>{(physical as any).type || 'unknown'}</strong></div>
                  <div>slotTarget: x {(physical as any).slotTarget?.x ?? (physical as any).transform?.rest?.x ?? '--'} y {(physical as any).slotTarget?.y ?? (physical as any).transform?.rest?.y ?? '--'} scale {(physical as any).slotTarget?.scale ?? '--'}</div>
                  <div>insertionAxis: {(physical as any).insertionAxis || 'z'} • path: {(physical as any).insertionPath || 'slot'}</div>
                  <div>zIndex: {(physical as any).zIndex ?? 3}</div>
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.6 }}>no physical media calibrated for this system</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
              }}
            >
              <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, marginBottom: 6 }}>GAMEPLAY REGIONS ({regions.length})</div>
              {regions.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {regions.map((r: any, i: number) => (
                    <div
                      key={r.id || i}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(18,26,44,0.03)',
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        lineHeight: 1.45,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{r.id} • {r.label || ''}</div>
                      <div style={{ opacity: 0.7 }}>
                        x {r.x?.toFixed ? r.x.toFixed(1) : r.x}% y {r.y?.toFixed ? r.y.toFixed(1) : r.y}% w {r.width?.toFixed ? r.width.toFixed(1) : r.width}% h {r.height?.toFixed ? r.height.toFixed(1) : r.height}%
                      </div>
                      <div style={{ opacity: 0.6 }}>
                        fit {r.fit || 'contain'} • radius {r.cornerRadius ?? '--'} • z {r.zIndex ?? 2} • AR {r.aspectRatio?.toFixed ? r.aspectRatio.toFixed(2) : r.aspectRatio || '--'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.6 }}>no regions – fallback single viewport</div>
              )}
            </div>

            {insertion && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(18,26,44,0.06)'}`,
                }}
              >
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.6, marginBottom: 4 }}>INSERTION ANIMATION</div>
                <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5 }}>duration {(insertion as any).durationMs || 480}ms • easing {(insertion as any).easing || 'cubic-bezier'}</div>
              </div>
            )}

            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: 0.54, lineHeight: 1.45 }}>
              <div>Toggle: L+R+View (gamepad 4+5 hold + 8). Keyboard: I / Ctrl+D (debug). Ally controls require physical human confirmation.</div>
              <div style={{ marginTop: 4 }}>This overlay respects NO-AUTOMATION for embedded controller hardware (README still authoritative).</div>
            </div>

            <button
              data-settings-control
              onClick={onClose}
              style={{
                padding: '10px 14px',
                borderRadius: 999,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.88)',
                color: isDark ? '#eef7ff' : '#16213e',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              [B] CLOSE DEBUG
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
