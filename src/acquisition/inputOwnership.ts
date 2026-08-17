import type { CrystalPresentationPhase } from './acquisitionUiController'

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
