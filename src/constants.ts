/**
 * Centralized timing constants for awb.
 */

/** Grace period before transitioning from thinking to idle (ms) */
export const THINKING_GRACE_PERIOD_MS = 3000;

/** Grace period for determining if an agent is idle based on marker vs modified time (ms) */
export const IDLE_GRACE_PERIOD_MS = 2000;

/** Time after which a marker is considered stale and can be cleaned up (ms) */
export const MARKER_CLEANUP_MS = 3600000; // 1 hour

/** Time threshold for determining if a marker indicates an active session (ms) */
export const ACTIVE_MARKER_STALE_MS = 5000;

/** Default threshold for considering a session active (ms) */
export const DEFAULT_THRESHOLD_MS = 30000;

/** Polling interval for wait and listen commands (ms) */
export const POLL_INTERVAL_MS = 500;
