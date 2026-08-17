import { useEffect, useRef, useState, useCallback } from 'react'
import { getGameNote, setGameNote, type GameNote } from '../lib/gameNotes'

type Props = {
  systemId?: string
  romBasename?: string
  gameName?: string
  isDark?: boolean
  visible: boolean
  onClose: () => void
  onSaved?: (note: GameNote) => void
}

/**
 * QuickMemoOverlay – appears when View held ~600ms anywhere.
 * Shows current game note if any, can edit quickly.
 * D-pad navigable, native textarea for on-screen keyboard.
 */
export function QuickMemoOverlay({ systemId, romBasename, gameName, isDark = true, visible, onClose, onSaved }: Props) {
  const [text, setText] = useState('')
  const [progress, setProgress] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const canOperate = !!(systemId && romBasename)

  const load = useCallback(async () => {
    if (!systemId || !romBasename) { setLoaded(true); return }
    try {
      const note = await getGameNote(systemId, romBasename)
      if (note) {
        setText(note.text || note.notes || '')
        setProgress(note.progress || 0)
      } else {
        setText('')
        setProgress(0)
      }
    } catch {}
    setLoaded(true)
  }, [systemId, romBasename])

  useEffect(() => {
    if (!visible) { setLoaded(false); return }
    setLoaded(false)
    load()
    const t = window.setTimeout(() => {
      try { textRef.current?.focus({ preventScroll: true }) } catch {}
    }, 120)
    return () => window.clearTimeout(t)
  }, [visible, load])

  const handleSave = async () => {
    if (!canOperate) { onClose(); return }
    setSaving(true)
    try {
      const note = await setGameNote(systemId!, romBasename!, text.slice(0,4000), Math.max(0, Math.min(100, progress)))
      if (note && onSaved) onSaved(note)
      setToast('✓ Saved')
      window.setTimeout(() => { setToast(null); onClose() }, 600)
    } catch {
      setToast('Failed – SAFE MODE?')
      window.setTimeout(() => setToast(null), 1600)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, text, progress, systemId, romBasename])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Quick memo ${gameName || romBasename || ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 64,
        display: 'grid',
        placeItems: 'center',
        background: isDark ? 'rgba(2,6,12,0.62)' : 'rgba(238,243,251,0.72)',
        backdropFilter: 'blur(14px) saturate(1.08)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.08)',
        padding: 14,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: 'min(420px, 92vw)',
          borderRadius: 16,
          border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`,
          background: isDark
            ? 'linear-gradient(135deg, rgba(12,18,28,0.96), rgba(10,16,26,0.92))'
            : 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,245,252,0.96))',
          boxShadow: isDark ? '0 16px 42px rgba(0,0,0,0.40), 0 0 0 1px rgba(125,249,255,0.06) inset' : '0 14px 36px rgba(18,26,44,0.18)',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.09em', opacity: 0.62, textTransform: 'uppercase' }}>Quick Memo – Hold View</div>
            <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 13, fontWeight: 700, color: isDark ? '#e6f7ff' : '#1a2d54', maxWidth: '26ch', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {gameName || romBasename || 'No game selected'}
            </div>
          </div>
          <button
            tabIndex={0}
            onClick={onClose}
            aria-label="Close quick memo"
            style={{
              width: 26, height: 26, borderRadius: 999,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.84)',
              color: isDark ? '#cdeeff' : '#2a3a5a',
              cursor: 'pointer',
            }}
          >✕</button>
        </div>

        {!canOperate ? (
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.68, padding: '10px 2px' }}>
            Select a game in Library to jot a memo – progress & notes survive reloads.
          </div>
        ) : !loaded ? (
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.56 }}>Loading…</div>
        ) : (
          <>
            <textarea
              ref={textRef}
              value={text}
              onChange={e => setText(e.target.value.slice(0,4000))}
              tabIndex={0}
              placeholder="Quick thought…"
              style={{
                width: '100%',
                minHeight: 84,
                maxHeight: 132,
                resize: 'vertical',
                borderRadius: 10,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.9)',
                color: isDark ? '#e8f4ff' : '#1a2a4a',
                padding: '8px 10px',
                fontFamily: 'var(--crystal-display)',
                fontSize: 12.5,
                lineHeight: 1.45,
                boxSizing: 'border-box',
                outline: 'none',
              }}
              maxLength={4000}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={e => setProgress(Number((e.target as any).value))}
                tabIndex={0}
                style={{ flex: 1, accentColor: isDark ? '#7df9ff' : '#4a86ff' }}
              />
              <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10.5, minWidth: 36, textAlign: 'right', color: isDark ? '#7df9ff' : '#295fdc' }}>{progress}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: isDark ? '#7df9ff' : '#4a86ff', transition: 'width 200ms ease' }} />
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: 0.52 }}>[View hold] close • [A] Save • B cancel</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              tabIndex={0}
              onClick={onClose}
              style={{
                borderRadius: 999, padding: '6px 12px',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.86)',
                color: isDark ? 'rgba(230,244,255,0.72)' : '#2f3f5f',
                fontFamily: 'var(--crystal-mono)', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
              }}
            >Close</button>
            <button
              tabIndex={0}
              onClick={handleSave}
              disabled={!canOperate || saving}
              style={{
                borderRadius: 999, padding: '6px 14px',
                border: 'none',
                background: isDark ? 'linear-gradient(100deg,#7df9ff,#aef0ff)' : 'linear-gradient(100deg,#4a86ff,#7aa8ff)',
                color: isDark ? '#041018' : '#fff',
                fontFamily: 'var(--crystal-mono)', fontSize: 10.5, fontWeight: 800,
                cursor: (!canOperate || saving) ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: isDark ? 'rgba(14,20,32,0.92)' : 'rgba(18,32,60,0.92)',
          color: '#eef7ff', padding: '6px 12px', borderRadius: 999,
          fontFamily: 'var(--crystal-mono)', fontSize: 10.5,
          border: `1px solid ${isDark ? 'rgba(125,249,255,0.18)' : 'rgba(70,130,255,0.18)'}`,
        }}>{toast}</div>
      )}
    </div>
  )
}

export default QuickMemoOverlay
