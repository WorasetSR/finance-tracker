// ─────────────────────────────────────────────────────────────
//  settings.js — localStorage-based app configuration
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

/** @readonly */
const KEYS = Object.freeze({
  owner:     'ft_gh_owner',
  repo:      'ft_gh_repo',
  branch:    'ft_gh_branch',
  token:     'ft_gh_token',
  lastSync:  'ft_last_sync',
  syncState: 'ft_sync_state',
});

// ── GitHub config ────────────────────────────────────────────

/**
 * Read GitHub sync configuration from localStorage.
 * @returns {{ owner: string, repo: string, branch: string, token: string } | null}
 *   Returns null if any of the four required keys is missing.
 */
export function getConfig() {
  const owner  = localStorage.getItem(KEYS.owner);
  const repo   = localStorage.getItem(KEYS.repo);
  const branch = localStorage.getItem(KEYS.branch);
  const token  = localStorage.getItem(KEYS.token);
  if (!owner || !repo || !branch || !token) return null;
  return { owner, repo, branch, token };
}

/**
 * Persist GitHub sync configuration to localStorage.
 * @param {{ owner: string, repo: string, branch: string, token: string }} config
 */
export function saveConfig({ owner, repo, branch, token }) {
  localStorage.setItem(KEYS.owner,  owner);
  localStorage.setItem(KEYS.repo,   repo);
  localStorage.setItem(KEYS.branch, branch);
  localStorage.setItem(KEYS.token,  token);
}

/**
 * Remove all GitHub config keys from localStorage.
 */
export function clearConfig() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
}

/**
 * True if all four required GitHub config keys are present and non-empty.
 * @returns {boolean}
 */
export function isConfigured() {
  return !!(
    localStorage.getItem(KEYS.owner)  &&
    localStorage.getItem(KEYS.repo)   &&
    localStorage.getItem(KEYS.branch) &&
    localStorage.getItem(KEYS.token)
  );
}

// ── Sync state ────────────────────────────────────────────────

/**
 * ISO timestamp of the last successful sync, or null.
 * @returns {string|null}
 */
export function getLastSync() {
  return localStorage.getItem(KEYS.lastSync);
}

/**
 * Persist the last-sync timestamp.
 * @param {string} iso — ISO datetime string
 */
export function setLastSync(iso) {
  localStorage.setItem(KEYS.lastSync, iso);
}

/**
 * Return the current sync state.
 * @returns {'synced'|'pending'|'error'|'offline'|'conflict'}
 */
export function getSyncState() {
  return /** @type {any} */ (localStorage.getItem(KEYS.syncState)) ?? 'offline';
}

/**
 * Persist the sync state indicator.
 * @param {'synced'|'pending'|'error'|'offline'|'conflict'} state
 */
export function setSyncState(state) {
  localStorage.setItem(KEYS.syncState, state);
}
