import type { CrystalPresentationPhase } from './acquisitionUiController'

/**
 * Crystal Frontend — Single A=confirm / B=back Navigation Contract
 * Pillar 1 (V3) – Navigation & Restore
 * 
 * Controller-first invariants:
 * 
 * 1. **Ownership** – At most one Layer owns A/B/D-pad at any moment.
 *    Layer priority stack (highest → lowest):
 *      a) Emulator launch bridge (fade-out) – no input accepted while exiting
 *      b) Provider Surface (in-app webview) – owns B for close, blocks library
 *      c) Acquisition surface (external Downloads watch) – owns B/confirm during blocking phases
 *      d) Modal / Dialog (Downloads inbox result, import progress, Discover detail)
 *          – owns A=confirm, B=back, must not leak to view underneath
 *      e) Inner View (Discover grid/browse/search, Library, Systems, Settings)
 * 
 * 2. **A=confirm**
 *    - Systems: ENTER library
 *    - Library: PLAY selected (unless SAFE MODE or modal)
 *    - Discover results: OPEN detail (grid) | when detail open + eligible -> GET GAME
 *    - Discover browse chips: SELECT browse letter
 *    - Settings: ACTIVATE focused control (via moveSettingsFocus)
 *    - Downloads inbox: REFRESH or INSTALL / CLEAR depending on focus
 *    - Any modal: PRIMARY action (DONE, CONTINUE, etc)
 * 
 * 3. **B=back**
 *    - Library/Settings/Discover results: return to parent (Systems) or origin
 *    - Discover detail: close detail → back to grid (single step, no double-pop)
 *    - Provider Surface: cancel acquisition surface
 *    - Acquisition terminal phases: close card
 *    - Modals: dismiss / close (and never trigger underlying nav)
 *    - System Landing: no-op (already root) – Menu opens Settings instead
 * 
 * 4. **No raw key listeners that leak**
 *    - All views must route through useSemanticInput → onAction(NavigationAction)
 *    - If a component needs native keyboard (e.g. search <input> in Discover),
 *      it must check isTyping / input ownership and return early from global key handler,
 *      but semantic handler still decides B path.
 *    - Every window.addEventListener('keydown') added for navigation MUST be paired
 *      with a check for acquisitionActive / providerSurf.active and call e.preventDefault().
 *      See DiscoverView: `if (acquisitionActive) { e.preventDefault(); return }`
 * 
 * 5. **No dead-ends**
 *    - Every view defines B → parent or Systems. Verified:
 *      - LibraryView: onBack prop = setView('system')
 *      - SystemLanding: no back (root), but App.tsx ensures left/right cycles and menu->settings
 *      - DiscoverView: onBack prop = restore origin (system/library) – single exit
 *      - DownloadResolverPanel: [B] CLOSE (Settings parent)
 *      - ProviderSurfaceView: onBack = cancel
 *      - AcquisitionStatusCard: onClose / onCancel – never leaves user in overlay with no B path
 *      - Settings: B or Menu → system
 *    - Gamepad B polling: useSemanticInput wraps gamepadAdapter.start() with edge handling,
 *      deadzone 0.25, initial 400ms / repeat 120ms, shared across all views.
 *    - Esc handling mirrors gamepad B (Esc/Backspace mapped to back in keyboard.ts)
 * 
 * 6. **Spatial memory integration**
 *    - When Systems carousel navigates, capture last_system_index → persisted to
 *      localStorage `crystal:nav` + restore.json (debounced 500ms) via saveRestoreState.
 *    - When Library selects a game, capture game_index + scroll offset → same stores.
 *    - On boot, attempt get_launch_restore_state; if recent (<5 min, version 1) restore
 *      view/system/game before enumeration finishes (instant restore placeholder).
 *      Otherwise fallback to localStorage. This guarantees instant restore never blocks
 *      and spatial memory survives reloads without secrets.
 * 
 * 7. **Testing checklist (ROG physical, 175% 1152x654)**
 *    - D-pad up/down/left/right cycles Systems and inside Library without duplication
 *    - A enters Library, B exits – no double-trigger after 10 rapid presses
 *    - In Discover detail, A triggers GET GAME only when eligible, B closes only one layer
 *    - While provider surface active, D-pad left/right underneath does NOT PLAY underlying game
 *    - After emulator launch (fade-out 380ms cubic 0.16,1,0.3,1) and return (480ms), input resumes
 *    - Every modal lists B hint visibly and pressing B truly escapes to parent.
 * 
 * Components MUST implement onAction per this contract; any direct document.onkeydown that
 * does not check ownership violates it. This file is the authoritative reference for audits.
 */

/**
 * Acquisition UI may own confirm while the user is on Discover, but it must
 * never swallow PLAY after the user has returned to a normal library.
 */
export function acquisitionOwnsConfirm(
  view: string,
  phase: CrystalPresentationPhase | string,
): boolean {
  if (view === 'library' || view === 'system') return false
  return [
    'PREPARING',
    'OPENING_GAME_PAGE',
    'WAITING_FOR_DOWNLOAD',
    'DOWNLOAD_DETECTED',
    'FINISHING_DOWNLOAD',
    'ADDING_TO_LIBRARY',
    'REFRESHING_LIBRARY',
    'ALREADY_IN_LIBRARY',
    'FILE_CONFLICT',
    'MULTIPLE_DOWNLOADS_FOUND',
    'FAILED',
    'SAFE_MODE',
    'TIMED_OUT',
    'INSTALLED_GAME_NOT_FOUND',
    'LIBRARY_REFRESH_FAILED',
    'CANCELLED',
  ].includes(phase)
}

/**
 * Helper – does acquisition own B/back in current phase?
 * Non-terminal blocking phases require cancel semantics; terminal closeable phases have close semantics.
 * Exported for consumers auditing ownership.
 */
export function acquisitionOwnsBack(
  phase: string,
): 'cancel' | 'close' | 'none' {
  if (['PREPARING','OPENING_GAME_PAGE','WAITING_FOR_DOWNLOAD','DOWNLOAD_DETECTED','FINISHING_DOWNLOAD','ADDING_TO_LIBRARY','REFRESHING_LIBRARY','ALREADY_IN_LIBRARY'].includes(phase)) {
    return 'cancel'
  }
  if (['FILE_CONFLICT','MULTIPLE_DOWNLOADS_FOUND','FAILED','SAFE_MODE','TIMED_OUT','INSTALLED_GAME_NOT_FOUND','LIBRARY_REFRESH_FAILED','CANCELLED','READY_TO_PLAY'].includes(phase)) {
    return 'close'
  }
  return 'none'
}

/**
 * View B-path validation (audit helper, no runtime import loop).
 * Ensures every view string known to contract has defined parent.
 */
export const VIEW_PARENT: Record<string,string> = {
  'library': 'systems',
  'discover': 'library|systems (origin-aware)',
  'settings': 'systems',
  'downloads': 'settings',
  'allgames': 'systems',
  'favorites': 'systems',
  'recent': 'systems',
  'system': 'root (no back)',
  'systems': 'root (no back)',
}

