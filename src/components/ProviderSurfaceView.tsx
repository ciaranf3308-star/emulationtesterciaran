/**
 * V8.6D1 – Provider Surface View – Crystal-owned chrome over ROMsFun child webview
 * Graphite / silver / cool electric thin restrained borders acrylic/crystal
 * Small provider identity "ROMsFun" + game title + "< Back"
 * No URL bar / tabs / reload / Edge branding – feels like temporary Crystal acquisition stage
 * Remote child must not cover entire window – Crystal header always visible, safe escape
 * Visual shell production-ready, child webview positioned below header via Rust LogicalPosition
 */

import { useEffect, useRef } from 'react';

type ProviderSurfaceViewProps = {
  theme: 'light' | 'dark';
  systemId: string;
  expectedTitle: string;
  currentUrl?: string;
  phase: string;
  blockedUrl?: string;
  errorMessage?: string;
  onBack: () => void;
  onResize?: (rect: { x: number; y: number; width: number; height: number }) => void;
};

export function ProviderSurfaceView({
  theme,
  systemId,
  expectedTitle,
  currentUrl,
  phase,
  blockedUrl,
  errorMessage,
  onBack,
}: ProviderSurfaceViewProps) {
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);

  // Controller minimal B/Back recovery – safe focus enter/exit – document ROG need
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'B' || e.key === 'b' || e.key === 'Backspace') {
        // B BACK – Crystal-owned escape, must remain recoverable while provider surface active
        // Even if Discover list would react underneath, we block via this capture
        e.preventDefault();
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as any);
  }, [onBack]);

  // Gamepad BButton minimal recovery – ROG validation needed but we implement basic
  useEffect(() => {
    let raf: number;
    let lastB = false;
    function poll() {
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const pad of pads) {
          if (!pad) continue;
          const b = pad.buttons?.[1]?.pressed; // B button typically index 1 on Xbox
          if (b && !lastB) {
            onBack();
          }
          lastB = !!b;
        }
      } catch {}
      raf = requestAnimationFrame(poll);
    }
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [onBack]);

  // Focus handling – ensures mouse/touch normal, keyboard normal inside child webview permitted,
  // but we don't use privileged Tauri input APIs to remote – child remains standard webview nav.

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[40] flex flex-col overflow-hidden"
      style={{
        background: isDark
          ? 'radial-gradient(120% 120% at 20% 0%, rgba(120,200,255,0.08), transparent 42%), radial-gradient(120% 120% at 80% 12%, rgba(180,200,255,0.06), transparent 48%), #0e0f12'
          : 'radial-gradient(120% 120% at 20% 0%, rgba(80,140,255,0.06), transparent 46%), radial-gradient(120% 120% at 80% 10%, rgba(160,180,255,0.05), transparent 52%), #f6f7f9',
      }}
    >
      {/* Crystal-owned header strip – graphite/silver/cool electric thin restrained borders acrylic/crystal */}
      <div
        className="flex-shrink-0 h-[88px] flex items-center justify-between px-6 border-b backdrop-blur-xl"
        style={{
          background: isDark
            ? 'linear-gradient(180deg, rgba(24,26,30,0.92), rgba(18,20,24,0.88))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.86), rgba(246,247,249,0.82))',
          borderColor: isDark ? 'rgba(200,210,230,0.10)' : 'rgba(0,0,0,0.08)',
          boxShadow: isDark
            ? 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.35)'
            : 'inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 0 rgba(255,255,255,0.6), 0 8px 20px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-center gap-5 min-w-0 flex-1">
          {/* Back affordance – always visible Crystal-owned escape */}
          <button
            onClick={onBack}
            className={`flex items-center gap-2.5 px-3.5 h-9 rounded-full border text-[12.5px] tracking-[0.03em] font-medium transition backdrop-blur-md select-none
              ${isDark ? 'border-white/10 bg-white/[0.06] hover:bg-white/[0.10] text-white/80 hover:text-white' : 'border-black/10 bg-black/[0.04] hover:bg-black/[0.07] text-black/70 hover:text-black'}`}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          >
            <span className="text-[14px] leading-none">←</span> <span className="hidden sm:inline">Back</span>
            <span className="ml-1 text-[10px] opacity-60 border border-current/20 rounded px-1 py-0.5">B</span>
          </button>

          {/* Provider identity + game identity */}
          <div className="flex items-center gap-3 min-w-0 ml-2">
            <div
              className={`h-7 px-3 rounded-full flex items-center justify-center border text-[10.5px] tracking-[0.12em] uppercase font-semibold
                ${isDark ? 'bg-[#e8eef7]/10 border-white/10 text-[#c8d8ef]' : 'bg-[#0f1a2a]/6 border-black/10 text-[#3a4a66]'}`}
              style={{ letterSpacing: '0.12em' }}
            >
              ROMsFun
            </div>

            <div className={`h-px w-6 ${isDark ? 'bg-white/10' : 'bg-black/10'} hidden sm:block`} />

            <div className="flex flex-col min-w-0">
              <div className={`text-[13.5px] font-semibold leading-tight truncate max-w-[22vw] sm:max-w-[28vw] lg:max-w-[36vw] ${isDark ? 'text-white/90' : 'text-black/80'}`}>
                {expectedTitle}
              </div>
              <div className={`text-[10.5px] tracking-wide ${isDark ? 'text-white/45' : 'text-black/45'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
                {systemId.toUpperCase()} · provider surface active
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Phase pill – small restrained */}
          <div
            className={`h-7 px-2.5 rounded-full border text-[10.5px] tracking-wide flex items-center gap-1.5
              ${phase === 'BROWSING_PROVIDER' ? (isDark ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200/80' : 'border-cyan-600/20 bg-cyan-600/10 text-cyan-700/80') :
                phase === 'DOWNLOAD_STARTING' || phase === 'DOWNLOADING' ? (isDark ? 'border-amber-300/30 bg-amber-300/10 text-amber-200/80' : 'border-amber-500/20 bg-amber-500/10 text-amber-700/80') :
                phase === 'EXTERNAL_NAVIGATION_BLOCKED' ? (isDark ? 'border-red-300/30 bg-red-300/10 text-red-200/80' : 'border-red-500/20 bg-red-500/10 text-red-700/80') :
                isDark ? 'border-white/10 bg-white/5 text-white/60' : 'border-black/10 bg-black/5 text-black/60'}`}
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${phase === 'BROWSING_PROVIDER' ? 'bg-emerald-400 animate-pulse' : phase === 'DOWNLOADING' ? 'bg-amber-400 animate-pulse' : 'bg-white/40'}`} />
            {phase.replace(/_/g, ' ')}
          </div>

          {/* Minimal provider chrome – no URL bar */}
          <div className={`hidden sm:flex items-center gap-2 text-[10.5px] ${isDark ? 'text-white/35' : 'text-black/35'}`} style={{ fontFamily: 'ui-monospace, monospace' }}>
            graphite · acrylic · thin
          </div>
        </div>
      </div>

      {/* Visual container for child webview – header is Crystal-owned, below region is where Tauri child webview sits @ LogicalPosition 0,88 */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Faint surface texture – not coloring provider page, just frame */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isDark
              ? 'radial-gradient(100% 80% at 12% 0%, rgba(100,180,255,0.04), transparent 38%), radial-gradient(90% 60% at 88% 16%, rgba(160,200,255,0.03), transparent 42%)'
              : 'radial-gradient(100% 80% at 12% 0%, rgba(40,120,255,0.03), transparent 40%), radial-gradient(90% 60% at 88% 16%, rgba(120,160,255,0.02), transparent 42%)',
          }}
        />

        {/* Placeholder shimmer / loading state when provider not yet positioned – production Tauri will have real child webview behind */}
        <div className={`absolute inset-0 flex flex-col items-center justify-start pt-16 px-12 text-center transition-opacity duration-300 ${phase === 'OPENING_PROVIDER' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className={`h-10 w-10 rounded-full border-b-2 animate-spin mb-4 ${isDark ? 'border-white/20 border-b-white/70' : 'border-black/10 border-b-black/60'}`} />
          <div className={`text-[13px] ${isDark ? 'text-white/70' : 'text-black/60'}`}>Opening provider surface…</div>
          <div className={`text-[11px] mt-1 ${isDark ? 'text-white/40' : 'text-black/40'}`} style={{ fontFamily: 'ui-monospace' }}>{currentUrl || 'https://romsfun.com/roms/…'}</div>
        </div>

        {/* External navigation blocked banner – Crystal blocked */}
        {phase === 'EXTERNAL_NAVIGATION_BLOCKED' && (
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 max-w-[92%] w-[520px] rounded-xl border backdrop-blur-xl px-4 py-3 flex items-start gap-3 z-10 shadow-2xl
            ${isDark ? 'bg-amber-950/60 border-amber-300/20 text-amber-100/85' : 'bg-amber-50/90 border-amber-400/30 text-amber-900/80'}`}
          >
            <div className="text-[18px] leading-none">◐</div>
            <div className="flex-1 min-w-0 text-[12.5px] leading-[1.45]">
              <div className="font-semibold">Crystal blocked an external page.</div>
              <div className="opacity-75 mt-0.5 break-all" style={{ fontFamily: 'ui-monospace' }}>{blockedUrl || 'Third-party popup blocked – keeping ROMsFun page alive'}</div>
              <div className="opacity-60 mt-1 text-[11px]">Do NOT allowlist galaxylanesandgames.com · first-party navigation only</div>
            </div>
          </div>
        )}

        {/* Simulated provider content frame – in production this area is occupied by Tauri child webview rendering real ROMsFun page */}
        <div
          className="absolute inset-0"
          style={{
            // Child webview sits at logical 0,88 with size full-width, full-height-88 – here we simulate its container
            // border thin restrained
            borderTop: `1px solid ${isDark ? 'rgba(220,235,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          }}
        >
          {/* Real child webview will be rendered by Tauri below this overlay – no inner HTML manipulation */}
          {/* For QA we show deterministic fixture representation when not in Tauri */}
          <div className={`h-full w-full overflow-auto p-0 ${phase === 'OPENING_PROVIDER' ? 'opacity-30' : 'opacity-100'} transition-opacity`}>
            {/* Fixture content for screenshot QA – exactly production shell with deterministic local fixture */}
            <div className={`mx-auto max-w-[960px] mt-8 rounded-2xl border ${isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white/70 border-black/10'} shadow-sm p-6`}>
              <div className={`text-[11px] uppercase tracking-[0.14em] ${isDark ? 'text-white/35' : 'text-black/40'}`} style={{ fontFamily: 'ui-monospace' }}>Provider surface – ROMsFun real page (fixture for QA / deterministic)</div>
              <div className={`mt-3 text-[16px] font-semibold ${isDark ? 'text-white/80' : 'text-black/75'}`}>{expectedTitle} – {systemId.toUpperCase()} on ROMsFun</div>
              <div className={`mt-2 text-[12.5px] leading-[1.6] ${isDark ? 'text-white/55' : 'text-black/55'}`}>
                This is Crystal’s in-app provider surface. The real ROMsFun webpage would render here in production Tauri build (child webview @ 0,88). No URL bar, no tabs, no reload, no Edge branding. User manually interacts with legitimate provider page. Browser download transfers are captured via <span className="font-mono text-[11px] px-1 py-0.5 rounded bg-white/10 border border-white/10">WebviewBuilder::on_download</span> → Crystal handles .part lifecycle, safe %LOCALAPPDATA%\\CrystalFrontend\\cache\\downloads\\&lt;session&gt;, import → refresh → exact selection → PLAY.
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`px-2 py-1 rounded-full border text-[10.5px] ${isDark ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200/70' : 'border-cyan-600/20 bg-cyan-600/10 text-cyan-700/70'}`}>Secure child webview – zero Tauri IPC to remote</span>
                  <span className={`px-2 py-1 rounded-full border text-[10.5px] ${isDark ? 'border-white/10 bg-white/5 text-white/60' : 'border-black/10 bg-black/5 text-black/60'}`}>First-party nav: romsfun.com / www.romsfun.com only</span>
                  <span className={`px-2 py-1 rounded-full border text-[10.5px] ${isDark ? 'border-red-300/20 bg-red-300/10 text-red-200/70' : 'border-red-500/20 bg-red-500/10 text-red-700/70'}`}>Third-party blocked – galaxylanes NOT allowlisted</span>
                </div>
              </div>
              {currentUrl && (
                <div className={`mt-4 text-[11px] break-all rounded-lg border px-3 py-2 ${isDark ? 'bg-black/30 border-white/10 text-white/45' : 'bg-black/5 border-black/10 text-black/50'}`} style={{ fontFamily: 'ui-monospace' }}>
                  {currentUrl}
                </div>
              )}
              {errorMessage && (
                <div className={`mt-3 text-[11.5px] px-3 py-2 rounded-lg border ${isDark ? 'bg-red-950/40 border-red-300/20 text-red-200/80' : 'bg-red-50/80 border-red-400/30 text-red-800/80'}`}>
                  {errorMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* B BACK/CLOSE hint – bottom overlay, never covered by remote child (Crystal-owned) */}
        <div className={`absolute bottom-0 left-0 right-0 h-[44px] flex items-center justify-center gap-3 border-t backdrop-blur-xl
          ${isDark ? 'bg-[#0e0f12]/82 border-white/8 text-white/55' : 'bg-white/82 border-black/8 text-black/55'}`}
        >
          <span className="text-[12px] font-medium tracking-wide" style={{ fontFamily: 'ui-monospace' }}>
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded border border-current/20 mr-2 text-[11px]">B</span> BACK / CLOSE
          </span>
          <span className={`h-3 w-px ${isDark ? 'bg-white/10' : 'bg-black/10'}`} />
          <span className="text-[11.5px] opacity-70 tracking-wide">Provider surface – Crystal retains control · ESC / B to return · no Edge</span>
        </div>
      </div>
    </div>
  );
}

export default ProviderSurfaceView;
