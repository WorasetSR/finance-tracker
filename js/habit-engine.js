// ─────────────────────────────────────────────────────────────
//  habit-engine.js — Local Statistical Habit Matching
//  Finance Tracker v2
//  Learns user categorization patterns from past transactions.
//  Runs 100% locally in the browser — 0 tokens, 0 network latency.
// ─────────────────────────────────────────────────────────────

const HABIT_KEY = 'ft_habit_map';

/**
 * @typedef {Object} HabitData
 * @property {Record<string, Record<string, number>>} memos
 * @property {Record<string, Record<string, number>>} payees
 */

/**
 * Get the current habit mapping dictionary from localStorage.
 * @returns {HabitData}
 */
export function getHabitData() {
  try {
    const raw = localStorage.getItem(HABIT_KEY);
    if (!raw) return { memos: {}, payees: {}, banks: {} };
    const parsed = JSON.parse(raw);
    return {
      memos:  parsed.memos  || {},
      payees: parsed.payees || {},
      banks:  parsed.banks  || {},
    };
  } catch {
    return { memos: {}, payees: {}, banks: {} };
  }
}

/**
 * Save habit data back to localStorage.
 * @param {HabitData} data
 */
function saveHabitData(data) {
  try {
    localStorage.setItem(HABIT_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Failed to save habit data to localStorage:', err);
  }
}

/**
 * Learn a new habit association whenever a transaction is saved/confirmed.
 * @param {Object} opts
 * @param {string} [opts.memo]
 * @param {string} [opts.payeeKey]
 * @param {string} [opts.categoryId]
 * @param {string} [opts.bankOrApp]
 * @param {string} [opts.accountId]
 */
export function learnHabit({ memo, payeeKey, categoryId, bankOrApp, accountId }) {
  const data = getHabitData();

  if (categoryId) {
    if (payeeKey && typeof payeeKey === 'string') {
      const pKey = payeeKey.trim();
      if (pKey) {
        data.payees[pKey] = data.payees[pKey] || {};
        data.payees[pKey][categoryId] = (data.payees[pKey][categoryId] || 0) + 1;
      }
    }

    if (memo && typeof memo === 'string') {
      const cleaned = memo.trim();
      if (cleaned) {
        data.memos[cleaned] = data.memos[cleaned] || {};
        data.memos[cleaned][categoryId] = (data.memos[cleaned][categoryId] || 0) + 1;
      }
    }
  }

  // Learn bank / app to user account mapping dynamically
  if (bankOrApp && typeof bankOrApp === 'string' && accountId) {
    const bKey = bankOrApp.toLowerCase().trim();
    if (bKey) {
      data.banks = data.banks || {};
      data.banks[bKey] = accountId;
    }
  }

  saveHabitData(data);
}

function _getTopCategory(counts) {
  if (!counts) return null;
  let topCat = null;
  let maxCount = 0;
  for (const [catId, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      topCat = catId;
    }
  }
  return topCat;
}

/**
 * Suggest a category ID based on bank tag, payee key, and memo text.
 *
 * @param {Object} opts
 * @param {string} [opts.memo]
 * @param {string} [opts.bankCategoryTag]
 * @param {string} [opts.payeeKey]
 * @param {Array<{id: string, name: string}>} [opts.categories]
 * @returns {string|null} categoryId or null
 */
export function suggestCategory({ memo = '', bankCategoryTag = '', payeeKey = '', categories = [] }) {
  // 1. Priority 1: Bank category tag (e.g. K PLUS "อาหารและเครื่องดื่ม" -> name contains "อาหาร")
  if (bankCategoryTag) {
    const tagClean = bankCategoryTag.trim().toLowerCase();
    const matched = categories.find(c =>
      c.name.toLowerCase().includes(tagClean) || tagClean.includes(c.name.toLowerCase())
    );
    if (matched) return matched.id;
  }

  const data = getHabitData();

  // 2. Priority 2: Payee Account Key in habitData
  if (payeeKey && data.payees && data.payees[payeeKey.trim()]) {
    const topCat = _getTopCategory(data.payees[payeeKey.trim()]);
    if (topCat) return topCat;
  }

  // 3. Priority 3: Exact Memo match
  const memoClean = (memo || '').trim();
  if (memoClean && data.memos) {
    if (data.memos[memoClean]) {
      const topCat = _getTopCategory(data.memos[memoClean]);
      if (topCat) return topCat;
    }

    // 4. Priority 4: Substring keyword match
    for (const [learnedWord, counts] of Object.entries(data.memos)) {
      if (memoClean.includes(learnedWord) || learnedWord.includes(memoClean)) {
        const topCat = _getTopCategory(counts);
        if (topCat) return topCat;
      }
    }
  }

  return null;
}

/**
 * Clear all learned habits.
 */
export function clearHabitData() {
  localStorage.removeItem(HABIT_KEY);
}
