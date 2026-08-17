import { useEffect, useRef, useState, useCallback } from 'react'
import type { GameNote } from '../lib/gameNotes'
import { getGameNote, setGameNote } from '../lib/gameNotes'

type Props = {
  systemId: string
  romBasename: string
  gameName?: string
  isDark?: boolean
  onClose: () => void
  onSaved?: (note: GameNote) => void
  initialGameId?: string // for focus return
}

export function GameNotesPanel({ systemId, romBasename, gameName, isDark = true, onClose, onSaved }: Props) {
  const [text, setText] = useState('')
  const [progress, setProgress] = useState(0)
  const [lastEdit, setLastEdit] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const saveBtnRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const note = await getGameNote(systemId, romBasename)
      if (note) {
        setText(note.text || note.notes || '')
        setProgress(Math.max(0, Math.min(100, note.progress || 0)))
        setLastEdit(note.last_edit)
      } else {
        setText('')
        setProgress(0)
        setLastEdit(null)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [systemId, romBasename])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    // autofocus textarea for on-screen keyboard support
    const t = window.setTimeout(() => {
      try { textareaRef.current?.focus({ preventScroll: true }) } catch {}
    }, 160)
    return () => window.clearTimeout(t)
  }, [])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const bounded = text.slice(0, 4000)
      const clamped = Math.max(0, Math.min(100, Math.round(progress)))
      const note = await setGameNote(systemId, romBasename, bounded, clamped)
      if (note) {
        setLastEdit(note.last_edit)
        onSaved?.(note)
      }
      setToast('✓ Note saved')
      window.setTimeout(() => setToast(null), 1800)
      try { window.dispatchEvent(new CustomEvent('crystal:game-note-saved', { detail: { system_id: systemId, rom_basename: romBasename } })) } catch {}
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (msg.includes('SAFE_MODE_BLOCKED')) {
        setToast('SAFE MODE – blocked')
      } else {
        setToast('Save failed')
      }
      window.setTimeout(() => setToast(null), 2200)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    onClose()
  }

  // Keyboard handling: Esc -> close (unless editing), Enter with Ctrl+S save
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      if (ev.key === 'Escape' && !isInput) {
        ev.preventDefault()
        onClose()
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Notes for ${gameName || romBasename}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 52,
        display: 'grid',
        placeItems: 'center',
        background: isDark ? 'rgba(4,8,14,0.72)' : 'rgba(242,246,252,0.76)',
        backdropFilter: 'blur(18px) saturate(1.12)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.12)',
        padding: 18,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        tabIndex={-1}
        style={{
          width: 'min(560px, 94vw)',
          maxHeight: '86vh',
          borderRadius: 18,
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)'}`,
          background: isDark
            ? 'linear-gradient(145deg, rgba(10,14,22,0.96), rgba(14,20,32,0.92))'
            : 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(240,244,251,0.96))',
          boxShadow: isDark ? '0 18px 48px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)' : '0 18px 42px rgba(18,26,44,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 16px 12px 16px',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.07)'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.10em', opacity: 0.56, textTransform: 'uppercase' }}>Notes • {systemId}</div>
            <div style={{ fontFamily: 'var(--crystal-display)', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: isDark ? '#eef7ff' : '#16213c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '36ch' }}>{gameName || romBasename}</div>
            {lastEdit && <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 9.5, opacity: 0.52, marginTop: 2 }}>Last edit {new Date(lastEdit).toLocaleString()}</div>}
          </div>
          <button
            onClick={onClose}
            tabIndex={0}
            style={{
              appearance: 'none',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(18,26,44,0.12)'}`,
              background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.88)',
              borderRadius: 999,
              width: 28,
              height: 28,
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              color: isDark ? 'rgba(230,244,255,0.82)' : '#2a3a5a',
            }}
            aria-label="Close notes"
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading ? (
            <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 11, opacity: 0.62, padding: 12 }}>Loading note…</div>
          ) : (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.68 }}>Your notes (max 4000) – on-screen keyboard supported</span>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={e => setText(e.target.value.slice(0, 4000))}
                  tabIndex={0}
                  placeholder="Write tactics, memories, backlog thoughts…"
                  style={{
                    width: '100%',
                    minHeight: 132,
                    maxHeight: 220,
                    resize: 'vertical',
                    borderRadius: 12,
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.12)'}`,
                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
                    color: isDark ? 'rgba(232,244,255,0.92)' : '#16213e',
                    padding: '10px 12px',
                    fontFamily: 'var(--crystal-display)',
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  maxLength={4000}
                />
                <span style={{ alignSelf: 'flex-end', fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.56 }}>{text.length}/4000</span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.68, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Progress {progress}%</span>
                  <span style={{ opacity: 0.86, color: isDark ? '#7df9ff' : '#295fdc' }}>{progress >= 100 ? '✓ Done' : progress >= 75 ? 'Nearly' : progress > 0 ? 'Playing' : 'Unstarted'}</span>
                </span>
                <input
                  ref={sliderRef}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={progress}
                  onChange={e => setProgress(Number((e.target as HTMLInputElement).value))}
                  tabIndex={0}
                  style={{
                    width: '100%',
                    accentColor: isDark ? '#7df9ff' : '#4a86ff',
                    cursor: 'pointer',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[0, 10, 25, 50, 75, 100].map(v => (
                    <button
                      key={v}
                      tabIndex={0}
                      onClick={() => setProgress(v)}
                      style={{
                        appearance: 'none',
                        borderRadius: 999,
                        padding: '4px 9px',
                        fontFamily: 'var(--crystal-mono)',
                        fontSize: 10,
                        border: `1px solid ${progress === v ? (isDark ? 'rgba(125,249,255,0.42)' : 'rgba(70,130,255,0.32)') : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.10)')}`,
                        background: progress === v ? (isDark ? 'rgba(125,249,255,0.16)' : 'rgba(70,130,255,0.14)') : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)'),
                        color: isDark ? 'rgba(230,244,255,0.82)' : '#26344f',
                        cursor: 'pointer',
                      }}
                    >{v}%</button>
                  ))}
                </div>
              </label>

              {/* progress bar visual */}
              <div style={{ height: 6, borderRadius: 999, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(18,26,44,0.08)', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: isDark ? 'linear-gradient(90deg,#7df9ff,#7ae1ff)' : 'linear-gradient(90deg,#4a86ff,#7aa8ff)', transition: 'width 220ms ease' }} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(18,26,44,0.07)'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          background: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(245,248,252,0.72)',
        }}>
          <div style={{ fontFamily: 'var(--crystal-mono)', fontSize: 10, opacity: 0.52 }}>
            [A] Save • [B] Cancel • D-pad navigable
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCancel}
              tabIndex={0}
              style={{
                appearance: 'none',
                borderRadius: 999,
                padding: '8px 14px',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(18,26,44,0.12)'}`,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)',
                color: isDark ? 'rgba(230,244,255,0.76)' : '#2a3a56',
                cursor: 'pointer',
              }}
            >Cancel</button>
            <button
              ref={saveBtnRef}
              onClick={handleSave}
              tabIndex={0}
              disabled={saving}
              style={{
                appearance: 'none',
                border: 'none',
                borderRadius: 999,
                padding: '8px 16px',
                fontFamily: 'var(--crystal-mono)',
                fontSize: 11.5,
                fontWeight: 800,
                background: isDark ? 'linear-gradient(100deg,#7df9ff,#a9f4ff)' : 'linear-gradient(100deg,#4a86ff,#7aa8ff)',
                color: isDark ? '#041018' : '#fff',
                cursor: saving ? 'wait' : 'pointer',
                boxShadow: isDark ? '0 6px 14px rgba(125,249,255,0.22)' : '0 6px 14px rgba(70,130,255,0.18)',
                opacity: saving ? 0.72 : 1,
              }}
            >{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: isDark ? 'rgba(18,24,36,0.92)' : 'rgba(22,33,62,0.92)',
          color: '#eef7ff',
          padding: '8px 14px',
          borderRadius: 999,
          fontFamily: 'var(--crystal-mono)',
          fontSize: 11,
          border: `1px solid ${isDark ? 'rgba(125,249,255,0.22)' : 'rgba(70,130,255,0.22)'}`,
          boxShadow: '0 8px 22px rgba(0,0,0,0.24)',
          pointerEvents: 'none',
        }}>{toast}</div>
      )}
    </div>
  )
}

export default GameNotesPanel
