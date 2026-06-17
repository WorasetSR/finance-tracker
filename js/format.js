// ─────────────────────────────────────────────────────────────
//  format.js — display formatting helpers
//  Finance Tracker v2
//  All currency values are integer minor units (THB × 100).
//  Dates are stored as YYYY-MM-DD strings (local time).
// ─────────────────────────────────────────────────────────────

// ── Thai month name tables ────────────────────────────────────

/** Abbreviated Thai month names, index 0 = January. */
export const thaiMonthNames = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const _THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// ── Currency ──────────────────────────────────────────────────

/**
 * Format an integer minor-unit amount to a Thai Baht display string.
 *
 * @param {number} amountMinor — THB × 100 (integer)
 * @param {Object} [opts]
 * @param {boolean} [opts.signed]  — prefix with + or - (default: only - for negatives)
 * @param {boolean} [opts.compact] — use "k" suffix for amounts ≥ 1 000 THB
 * @returns {string} e.g. "฿1,234.50", "+฿12.00", "฿1.2k"
 *
 * @example
 * formatTHB(123450)              // "฿1,234.50"
 * formatTHB(-50000)              // "-฿500.00"
 * formatTHB(123450, {signed:true})   // "+฿1,234.50"
 * formatTHB(1234500, {compact:true}) // "฿12.3k"
 */
export function formatTHB(amountMinor, opts = {}) {
  const isNeg  = amountMinor < 0;
  const absMin = Math.abs(amountMinor);
  const baht   = absMin / 100;

  let numStr;
  if (opts.compact && absMin >= 100_000) {
    // ≥ 1 000 THB → compact "k" notation
    const kVal = baht / 1000;
    const decimals = kVal < 10 ? 1 : 0;
    numStr = kVal.toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }) + 'k';
  } else {
    numStr = baht.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (opts.signed) {
    return isNeg ? `-฿${numStr}` : `+฿${numStr}`;
  }
  return isNeg ? `-฿${numStr}` : `฿${numStr}`;
}

// ── Date helpers ──────────────────────────────────────────────

/**
 * Parse a YYYY-MM-DD string to a local Date object (avoids UTC offset issues).
 * @param {string} dateStr
 * @returns {Date|null}
 */
function _parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length < 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/**
 * Format a date as "16 มิ.ย. 2569" (Buddhist Era year).
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {string}
 */
export function formatDate(dateStr) {
  const d = _parseDate(dateStr);
  if (!d) return '';
  return `${d.getDate()} ${thaiMonthNames[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * Format a date as "16 มิ.ย." (no year).
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {string}
 */
export function formatDateShort(dateStr) {
  const d = _parseDate(dateStr);
  if (!d) return '';
  return `${d.getDate()} ${thaiMonthNames[d.getMonth()]}`;
}

/**
 * Format a date relatively:
 *   - "วันนี้"   if dateStr equals today
 *   - "เมื่อวาน" if dateStr equals yesterday
 *   - formatDateShort(dateStr) otherwise
 *
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {string}
 */
export function formatDateRelative(dateStr) {
  if (!dateStr) return '';

  const now   = new Date();
  const pad   = (n) => String(n).padStart(2, '0');
  const fmt   = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const todayISO = fmt(now);
  const yest     = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterdayISO = fmt(yest);

  if (dateStr === todayISO)     return 'วันนี้';
  if (dateStr === yesterdayISO) return 'เมื่อวาน';
  return formatDateShort(dateStr);
}

/**
 * Format a YYYY-MM string as "มิถุนายน 2569".
 * @param {string} monthStr — YYYY-MM
 * @returns {string}
 */
export function formatMonth(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m) return '';
  return `${_THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
}

/**
 * Format a YYYY-MM string as "มิ.ย. 2569".
 * @param {string} monthStr — YYYY-MM
 * @returns {string}
 */
export function formatMonthShort(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m) return '';
  return `${thaiMonthNames[m - 1]} ${y + 543}`;
}

// ── Input parsing ─────────────────────────────────────────────

/**
 * Parse a user-typed amount string to integer minor units.
 * Strips commas, whitespace, and the ฿ symbol.
 *
 * @param {string|number} str — e.g. "1,234.50", "1234", "12.5", "฿500"
 * @returns {number} integer minor units (rounds half-up)
 *
 * @example
 * parseAmount("1,234.50") // 123450
 * parseAmount("1234")     // 123400
 * parseAmount("12.5")     // 1250
 * parseAmount("")         // 0
 */
export function parseAmount(str) {
  if (str === null || str === undefined || str === '') return 0;
  const cleaned = String(str)
    .replace(/฿/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '');
  const n = parseFloat(cleaned);
  if (!isFinite(n)) return 0;
  // Math.round avoids floating-point drift (e.g. 12.5 * 100 = 1249.9999...)
  return Math.round(n * 100);
}
