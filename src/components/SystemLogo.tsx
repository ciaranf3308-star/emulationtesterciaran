import React from 'react'

/**
 * SystemLogo – V7.3 showroom shelf primary content
 *
 * Preferred API:
 *  SystemLogo { systemId, logoUrl, fallbackName, isSelected?, size?, theme? }
 *
 * - Uses actual platform logo assets wherever available via logoUrl.
 * - Fallback to tasteful full system name, never raw ID as hero branding.
 * - Swappable provider: later Canvas logo set can be swapped by feeding different logoUrl without redesigning shelf.
 */

export type SystemLogoProps = {
  systemId: string
  logoUrl?: string
  fallbackName?: string
  isSelected?: boolean
  theme?: 'light' | 'dark'
  className?: string
  style?: React.CSSProperties
}

function formatFallback(systemId: string, fallbackName?: string): string {
  if (fallbackName && fallbackName.trim()) {
    // Avoid using raw ID like "ps2" if fallbackName already is raw ID? Still prefer full name.
    // If fallback looks like same as id lowercased, expand a bit nicer
    return fallbackName
  }
  // Last resort: transform id to readable – never show raw id as-is if we can beautify
  const map: Record<string, string> = {
    gb: 'Game Boy',
    gbc: 'Game Boy Color',
    gba: 'Game Boy Advance',
    nds: 'Nintendo DS',
    n3ds: 'Nintendo 3DS',
    snes: 'Super Nintendo',
    n64: 'Nintendo 64',
    gc: 'GameCube',
    wii: 'Wii',
    wiiu: 'Wii U',
    genesis: 'Genesis',
    megadrive: 'Mega Drive',
    dreamcast: 'Dreamcast',
    psx: 'PlayStation',
    ps2: 'PlayStation 2',
    psp: 'PlayStation Portable',
    xbox: 'Xbox',
    xbox360: 'Xbox 360',
    steam: 'Steam',
  }
  if (map[systemId]) return map[systemId]
  // generic title-case from id
  return systemId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

export function SystemLogo({ systemId, logoUrl, fallbackName, isSelected, theme = 'dark', className, style }: SystemLogoProps) {
  const displayName = formatFallback(systemId, fallbackName)
  const isDark = theme === 'dark'
  // selected gets modest forward treatment – handled externally too but we add subtle glow here
  return (
    <div
      className={`system-logo ${isSelected ? 'is-selected' : ''} ${className || ''}`}
      data-system-id={systemId}
      data-selected={isSelected ? '1' : '0'}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        minHeight: 48,
        pointerEvents: 'none',
        userSelect: 'none',
        ...style,
      }}
      aria-label={displayName}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={displayName}
          loading="lazy"
          decoding="async"
          style={{
            maxWidth: isSelected ? 168 : 142,
            maxHeight: isSelected ? 72 : 58,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain' as const,
            filter: isSelected
              ? isDark
                ? 'drop-shadow(0 0 18px rgba(125,249,255,0.28)) drop-shadow(0 6px 22px rgba(0,0,0,0.55)) brightness(1.06)'
                : 'drop-shadow(0 0 16px rgba(90,180,255,0.22)) drop-shadow(0 5px 18px rgba(0,0,0,0.18)) brightness(1.04)'
              : isDark
                ? 'drop-shadow(0 3px 12px rgba(0,0,0,0.45)) brightness(0.96) saturate(0.96)'
                : 'drop-shadow(0 2px 10px rgba(0,0,0,0.12)) brightness(0.98)',
            transform: 'translateZ(0)',
            transition: 'filter 320ms cubic-bezier(0.16,1,0.3,1), max-width 360ms cubic-bezier(0.16,1,0.3,1), max-height 360ms cubic-bezier(0.16,1,0.3,1), opacity 280ms ease',
            opacity: isSelected ? 1 : 0.86,
          }}
        />
      ) : (
        <span
          style={{
            fontFamily: 'var(--crystal-display)',
            fontSize: isSelected ? 18 : 14,
            fontWeight: isSelected ? 600 : 500,
            letterSpacing: '-0.02em',
            color: isDark ? 'rgba(235,245,255,0.92)' : 'rgba(18,24,38,0.92)',
            textShadow: isSelected
              ? isDark
                ? '0 0 22px rgba(125,249,255,0.32), 0 2px 14px rgba(0,0,0,0.6)'
                : '0 0 18px rgba(90,180,255,0.22), 0 2px 10px rgba(0,0,0,0.12)'
              : 'none',
            opacity: isSelected ? 1 : 0.84,
            lineHeight: 1.1,
            textAlign: 'center',
            transition: 'font-size 300ms cubic-bezier(0.16,1,0.3,1), opacity 260ms ease, text-shadow 320ms ease',
          }}
        >
          {displayName}
        </span>
      )}
    </div>
  )
}

export default SystemLogo
