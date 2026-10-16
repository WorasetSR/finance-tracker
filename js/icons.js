// ─────────────────────────────────────────────────────────────
//  icons.js — Minimalist Stroke SVG Icon System (Zero-Emoji Engine)
//  Finance Tracker v4.0
//  Automatically maps both semantic icon keys and legacy emojis
//  to clean 1.8px stroke vector icons (Lucide/Linear geometry).
// ─────────────────────────────────────────────────────────────

export const ICON_PATHS = {
  // ── Accounts & Finance ─────────────────────────────────────
  'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  'landmark':    '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  'banknote':    '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  'wallet':      '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  'smartphone':  '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  'gem':         '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  'coins':       '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'piggy-bank':  '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',

  // ── Categories (Expense & Income) ──────────────────────────
  'utensils':     '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  'car':          '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'heart-pulse':  '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  'box':          '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'gamepad':      '<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/>',
  'plane':        '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  'home':         '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'book-open':    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'sparkles':     '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>',
  'music':        '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'dumbbell':     '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  'coffee':       '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
  'paw':          '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
  'briefcase':    '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  'gift':         '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  'users':        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',

  // ── Subscriptions & Utilities ──────────────────────────────
  'tv':           '<rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
  'globe':        '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  'zap':          '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'droplet':      '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  'shield':       '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'cloud':        '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',

  // ── UI & Navigation Actions ────────────────────────────────
  'arrow-up-right':   '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
  'arrow-down-left':  '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>',
  'arrow-left-right': '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  'repeat':           '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  'bell':             '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  'list':             '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  'calendar':         '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  'pie-chart':        '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  'split':            '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
  'edit':             '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  'check':            '<polyline points="20 6 9 17 4 12"/>',
  'plus':             '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'camera':           '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  'download':         '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'upload':           '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'chevron-down':     '<polyline points="6 9 12 15 18 9"/>',
  'chevron-up':       '<polyline points="18 15 12 9 6 15"/>',
  'chevron-right':    '<polyline points="9 18 15 12 9 6"/>',
  'chevron-left':     '<polyline points="15 18 9 12 15 6"/>',
  'arrow-up':         '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  'arrow-down':       '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  'zoom-in':          '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
};

// Maps legacy emojis stored in IndexedDB / Supabase to clean SVG icon keys
export const EMOJI_TO_ICON = {
  // Accounts
  '💳': 'credit-card',
  '🏦': 'landmark',
  '💵': 'banknote',
  '👛': 'wallet',
  '📱': 'smartphone',
  '💎': 'gem',
  '🏠': 'home',
  '💰': 'coins',
  // Categories
  '🍔': 'utensils',
  '🍜': 'utensils',
  '🚗': 'car',
  '🛍️': 'shopping-bag',
  '🛍': 'shopping-bag',
  '💊': 'heart-pulse',
  '📦': 'box',
  '🎮': 'gamepad',
  '✈️': 'plane',
  '✈':  'plane',
  '📚': 'book-open',
  '💡': 'sparkles',
  '🎵': 'music',
  '🏋️': 'dumbbell',
  '🏋': 'dumbbell',
  '☕': 'coffee',
  '🐶': 'paw',
  '💼': 'briefcase',
  '🎁': 'gift',
  '📈': 'trending-up',
  '🤝': 'users',
  '💸': 'arrow-up-right',
  '↔️': 'arrow-left-right',
  '↔':  'arrow-left-right',
  // Subscriptions & UI
  '🎬': 'tv',
  '🌐': 'globe',
  '⚡': 'zap',
  '💧': 'droplet',
  '🛡️': 'shield',
  '🛡': 'shield',
  '☁️': 'cloud',
  '☁':  'cloud',
  '🔔': 'bell',
  '📋': 'list',
  '📅': 'calendar',
  '📊': 'pie-chart',
  '🔄': 'repeat',
  '➗': 'split',
  '✏️': 'edit',
  '✏':  'edit',
};

export const ACCOUNT_ICON_KEYS = [
  'credit-card',
  'landmark',
  'banknote',
  'wallet',
  'smartphone',
  'piggy-bank',
  'gem',
  'coins',
];

export const CATEGORY_ICON_KEYS = [
  'utensils',
  'car',
  'shopping-bag',
  'heart-pulse',
  'box',
  'gamepad',
  'plane',
  'home',
  'book-open',
  'sparkles',
  'music',
  'dumbbell',
  'coffee',
  'paw',
  'briefcase',
  'gift',
  'trending-up',
  'users',
];

export const SUB_ICON_KEYS = [
  'tv',
  'music',
  'smartphone',
  'globe',
  'home',
  'zap',
  'droplet',
  'shield',
  'dumbbell',
  'cloud',
  'box',
  'credit-card',
];

/**
 * Normalize an icon key or legacy emoji string to a valid ICON_PATHS key.
 * @param {string} raw
 * @param {string} [fallback='box']
 * @returns {string}
 */
export function normalizeIconKey(raw, fallback = 'box') {
  if (!raw) return fallback;
  const trimmed = String(raw).trim();
  if (ICON_PATHS[trimmed]) return trimmed;
  if (EMOJI_TO_ICON[trimmed]) return EMOJI_TO_ICON[trimmed];
  return fallback;
}

/**
 * Render an inline minimalist stroke SVG icon.
 * @param {string} iconOrEmoji
 * @param {number} [size=18]
 * @param {string} [className='']
 * @returns {string} HTML string for <svg>
 */
export function renderIcon(iconOrEmoji, size = 18, className = '') {
  const key = normalizeIconKey(iconOrEmoji, 'box');
  const inner = ICON_PATHS[key] || ICON_PATHS['box'];
  const cls = className ? ` class="ui-svg-icon ${className}"` : ' class="ui-svg-icon"';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${cls} aria-hidden="true">${inner}</svg>`;
}
