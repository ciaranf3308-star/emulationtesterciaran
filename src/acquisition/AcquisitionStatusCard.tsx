/**
 * V8.6C2 – Acquisition Status Card
 * Compact premium glass/acrylic surface integrated into Crystal composition.
 * Charcoal / silver / cyan language, restrained hairlines, subtle blur.
 * No orange, no giant modal, no download-manager chrome.
 * 1140x648 safe, controller hints visible.
 */

import { useMemo } from "react"
import type { ExternalAcquisitionState } from "./externalAcquisition"
import { mapExternalToCrystalPhase, crystalCopyForPhase, type CrystalPresentationPhase } from "./acquisitionUiController"

export type AcquisitionStatusCardProps = {
  externalState: ExternalAcquisitionState | null
  crystalPhase?: CrystalPresentationPhase
  theme: "light" | "dark"
  onCancel?: () => void
  onClose?: () => void
  onPlay?: () => void
  forcePresentForFixture?: boolean
  compact?: boolean
}

function phaseIcon(phase: CrystalPresentationPhase): string {
  switch (phase) {
    case "PREPARING": return "◐"
    case "OPENING_GAME_PAGE": return "↗"
    case "WAITING_FOR_DOWNLOAD": return "◑"
    case "DOWNLOAD_DETECTED": return "◔"
    case "FINISHING_DOWNLOAD": return "◒"
    case "ADDING_TO_LIBRARY": return "◓"
    case "REFRESHING_LIBRARY": return "◑"
    case "READY_TO_PLAY": return "▶"
    case "ALREADY_IN_LIBRARY": return "★"
    case "FILE_CONFLICT": return "!"
    case "MULTIPLE_DOWNLOADS_FOUND": return "…"
    case "SAFE_MODE": return "⬢"
    case "FAILED": return "✕"
    case "TIMED_OUT": return "◷"
    case "CANCELLED": return "✕"
    case "INSTALLED_GAME_NOT_FOUND": return "✓"
    default: return "·"
  }
}

export function AcquisitionStatusCard({
  externalState,
  crystalPhase: crystalPhaseProp,
  theme,
  onCancel,
  onClose,
  onPlay,
  forcePresentForFixture,
  compact,
}: AcquisitionStatusCardProps) {
  const isDark = theme === "dark"
  const extPhase = externalState?.phase ?? "IDLE"
  const derivedCrystal = useMemo(() => {
    if (crystalPhaseProp) return crystalPhaseProp
    if (!externalState) return "IDLE" as CrystalPresentationPhase
    return mapExternalToCrystalPhase(extPhase as any, { errorCode: externalState.errorCode })
  }, [extPhase, externalState, crystalPhaseProp])

  const copy = useMemo(() => {
    if (!externalState && !crystalPhaseProp) return { title: "" }
    const ec = externalState?.errorCode
    const msg = externalState?.message
    const title = externalState?.expectedTitle
    return crystalCopyForPhase(derivedCrystal, { errorCode: ec, message: msg, expectedTitle: title })
  }, [derivedCrystal, externalState, crystalPhaseProp])

  const isTerminal = derivedCrystal === "READY_TO_PLAY" || derivedCrystal === "FILE_CONFLICT" || derivedCrystal === "MULTIPLE_DOWNLOADS_FOUND" || derivedCrystal === "FAILED" || derivedCrystal === "SAFE_MODE" || derivedCrystal === "TIMED_OUT" || derivedCrystal === "CANCELLED" || derivedCrystal === "INSTALLED_GAME_NOT_FOUND"
  const isWaiting = derivedCrystal === "WAITING_FOR_DOWNLOAD" || derivedCrystal === "DOWNLOAD_DETECTED" || derivedCrystal === "FINISHING_DOWNLOAD" || derivedCrystal === "ADDING_TO_LIBRARY" || derivedCrystal === "REFRESHING_LIBRARY" || derivedCrystal === "PREPARING" || derivedCrystal === "OPENING_GAME_PAGE"

  const show = forcePresentForFixture || externalState != null
  if (!show) return null
  if (!forcePresentForFixture && derivedCrystal === "IDLE") return null

  const glyph = phaseIcon(derivedCrystal)

  return (
    <div
      data-testid="acquisition-status-card"
      data-crystal-phase={derivedCrystal}
      data-external-phase={extPhase}
      style={{
        position: "absolute",
        right: 18,
        bottom: 18,
        zIndex: 12,
        pointerEvents: "auto",
        width: compact ? "min(88vw, 320px)" : "min(88vw, 380px)",
        maxWidth: "92%",
        borderRadius: 16,
        background: isDark
          ? "linear-gradient(180deg, rgba(18,24,36,0.66) 0%, rgba(12,16,24,0.58) 100%)"
          : "linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(248,252,255,0.76) 100%)",
        backdropFilter: "blur(18px) saturate(1.15)",
        WebkitBackdropFilter: "blur(18px) saturate(1.15)",
        border: `1px solid ${isDark ? "rgba(125,249,255,0.12)" : "rgba(18,26,44,0.08)"}`,
        boxShadow: isDark
          ? "0 12px 32px rgba(0,0,0,0.42), 0 0 0 1px rgba(125,249,255,0.08) inset, inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 14px 36px rgba(18,26,44,0.16), inset 0 1px 0 rgba(255,255,255,0.96)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        aria-hidden
        style={{
          height: 1,
          background: isDark
            ? "linear-gradient(90deg, rgba(125,249,255,0.0), rgba(125,249,255,0.28), rgba(125,249,255,0.0))"
            : "linear-gradient(90deg, transparent, rgba(70,130,255,0.24), transparent)",
          opacity: 0.9,
        }}
      />

      <div style={{ padding: "12px 14px 10px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: isDark ? "rgba(125,249,255,0.10)" : "rgba(70,130,255,0.10)",
            border: `1px solid ${isDark ? "rgba(125,249,255,0.16)" : "rgba(70,130,255,0.14)"}`,
            color: isDark ? "#7df9ff" : "#3a6ee8",
            fontFamily: "var(--crystal-mono)",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
            animation: isWaiting ? "crystal-spin 1.6s linear infinite" : undefined,
          }}
        >
          {glyph}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--crystal-mono)",
                fontSize: 11.5,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: isDark ? "#eaf8ff" : "#16213e",
                fontWeight: 720,
                lineHeight: 1.2,
              }}
            >
              {copy.title}
            </span>
            {copy.titleDetail && (
              <span
                style={{
                  fontFamily: "var(--crystal-mono)",
                  fontSize: 9,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: isDark ? "rgba(255,255,255,0.06)" : "rgba(18,26,44,0.06)",
                  color: isDark ? "rgba(230,244,255,0.62)" : "rgba(18,26,44,0.56)",
                  letterSpacing: "0.04em",
                }}
              >
                {copy.titleDetail}
              </span>
            )}
          </div>

          {copy.subtitle && (
            <div
              style={{
                fontFamily: "var(--crystal-display)",
                fontSize: 12.2,
                lineHeight: 1.42,
                color: isDark ? "rgba(230,244,255,0.72)" : "rgba(18,26,44,0.68)",
                whiteSpace: "pre-line",
              }}
            >
              {copy.subtitle}
            </div>
          )}

          {!isTerminal && externalState?.expectedTitle && (
            <div
              style={{
                fontFamily: "var(--crystal-mono)",
                fontSize: 10,
                opacity: 0.58,
                color: isDark ? "rgba(230,244,255,0.72)" : "rgba(18,26,44,0.62)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {externalState.expectedTitle} • {externalState.systemId}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px 10px 12px",
          borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(18,26,44,0.06)"}`,
          background: isDark ? "rgba(8,12,20,0.18)" : "rgba(248,250,255,0.42)",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isTerminal ? (
            <>
              {derivedCrystal === "READY_TO_PLAY" && onPlay && (
                <button
                  onClick={onPlay}
                  data-action="acq-play"
                  style={{
                    appearance: "none",
                    border: "none",
                    borderRadius: 999,
                    padding: "7px 13px 7px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: isDark ? "linear-gradient(100deg, #7df9ff 0%, #a9f4ff 100%)" : "linear-gradient(100deg, #4a86ff 0%, #7aa8ff 100%)",
                    color: isDark ? "#041018" : "#fff",
                    fontFamily: "var(--crystal-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: isDark ? "0 6px 14px rgba(125,249,255,0.18)" : "0 6px 14px rgba(70,130,255,0.16)",
                  }}
                >
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.12)", display: "grid", placeItems: "center", fontSize: 10 }}>A</span>
                  PLAY
                </button>
              )}
              {derivedCrystal !== "READY_TO_PLAY" && onClose && (
                <button
                  onClick={onClose}
                  data-action="acq-close"
                  style={{
                    appearance: "none",
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(18,26,44,0.10)"}`,
                    borderRadius: 999,
                    padding: "6px 12px",
                    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.86)",
                    color: isDark ? "rgba(230,244,255,0.82)" : "rgba(18,26,44,0.72)",
                    fontFamily: "var(--crystal-mono)",
                    fontSize: 10.5,
                    cursor: "pointer",
                  }}
                >
                  B CLOSE
                </button>
              )}
            </>
          ) : (
            onCancel && (
              <button
                onClick={onCancel}
                data-action="acq-cancel"
                style={{
                  appearance: "none",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(18,26,44,0.10)"}`,
                  borderRadius: 999,
                  padding: "6px 12px",
                  background: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.74)",
                  color: isDark ? "rgba(230,244,255,0.74)" : "rgba(18,26,44,0.66)",
                  fontFamily: "var(--crystal-mono)",
                  fontSize: 10.5,
                  cursor: "pointer",
                }}
              >
                B CANCEL
              </button>
            )
          )}
        </div>

        <div
          style={{
            fontFamily: "var(--crystal-mono)",
            fontSize: 9.5,
            letterSpacing: "0.06em",
            opacity: 0.48,
            color: isDark ? "rgba(230,244,255,0.56)" : "rgba(18,26,44,0.48)",
          }}
        >
          {isTerminal ? (derivedCrystal === "READY_TO_PLAY" ? "READY" : "DONE") : "ACQUISITION"}
        </div>
      </div>

      <style>{`
        @keyframes crystal-spin { to { transform: rotate(360deg); } }
        @media (max-width: 1140px) {
          [data-testid="acquisition-status-card"] { right: 12px !important; bottom: 12px !important; width: min(92vw, 300px) !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="acquisition-status-card"] [style*="crystal-spin"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

export default AcquisitionStatusCard
