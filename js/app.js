// ─────────────────────────────────────────────────────────────
//  app.js — entry point, router, shared modal management
//  Finance Tracker v4.0 (Ultra-Minimal Mobile-First)
// ─────────────────────────────────────────────────────────────

import { LocalStore }                    from './local-store.js';
import { getConfig, saveConfig, isConfigured, getSyncState, getGeminiKey, saveGeminiKey } from './settings.js';
import { GitHubSync }                    from './sync.js';
import {
  pullAllFromSupabase,
  migrateAllToSupabase,
  syncAccount,
  deleteAccount as deleteSupabaseAccount,
  syncCategory,
  deleteCategory as deleteSupabaseCategory,
  syncBudget,
  deleteBudget as deleteSupabaseBudget,
  syncTransaction,
  deleteTransaction as deleteSupabaseTransaction,
  isSupabaseConfigured,
  getSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
} from './supabase-client.js';
import { makeTransaction, makeAccount, makeCategory, makeBudget, genId, todayStr, currentMonth } from './schema.js';
import { parseAmount, formatTHB, formatMonth } from './format.js';
import { parseSlipImage, matchBankToAccount, compressImage } from './slip-parser.js';
import { suggestCategory, learnHabit, getHabitData } from './habit-engine.js';
import { getSubscriptions, saveSubscription, deleteSubscription, paySubscription } from './subscriptions.js';
import {
  getGroupPools,
  saveGroupPool,
  deleteGroupPool,
  makeGroupPool,
  makePoolMember,
  topUpMember,
} from './group-pool.js';
import { exportTransactions, exportFullJsonBackup, importFullJsonBackup } from './export.js';
import {
  renderIcon,
  normalizeIconKey,
  ACCOUNT_ICON_KEYS,
  CATEGORY_ICON_KEYS,
  SUB_ICON_KEYS,
} from './icons.js';
import { initDashboard }                 from './pages/dashboard.js';
import { initTransactions }              from './pages/transactions.js';
import { initBudget }                    from './pages/budget.js';
import { initAnalytics }                 from './pages/analytics.js';
import { initAccounts }                  from './pages/accounts.js';


// ── Globals ───────────────────────────────────────────────────

const store  = new LocalStore();
const syncer = new GitHubSync();

// ── Font picker ───────────────────────────────────────────────

const FONTS = [
  { id: 'dm-sans', name: 'DM Sans',  sample: 'DM Sans — ทันสมัย คมชัด',   css: "'DM Sans', 'Noto Sans Thai', system-ui, sans-serif",  url: null },
  { id: 'sarabun', name: 'Sarabun',  sample: 'Sarabun — อ่านง่าย สบายตา', css: "'Sarabun', system-ui, sans-serif",  url: 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600&display=swap' },
  { id: 'prompt',  name: 'Prompt',   sample: 'Prompt — กลมนุ่ม สมดุล',   css: "'Prompt', system-ui, sans-serif",   url: 'https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600&display=swap' },
  { id: 'inter',   name: 'Inter',    sample: 'Inter — เรียบง่าย มาตรฐาน', css: "'Inter', 'Noto Sans Thai', system-ui, sans-serif",    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap' },
];

const FONT_KEY = 'ft_font';

function loadFont(font) {
  if (!font.url) return;
  if (document.querySelector(`link[data-font="${font.id}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = font.url;
  link.dataset.font = font.id;
  document.head.appendChild(link);
}

function applyFont(fontId) {
  const font = FONTS.find(f => f.id === fontId) || FONTS[0];
  loadFont(font);
  document.documentElement.style.setProperty('--font', font.css);
  localStorage.setItem(FONT_KEY, font.id);
}

applyFont(localStorage.getItem(FONT_KEY) || 'dm-sans');

// ── Theme picker ──────────────────────────────────────────────

const THEMES = [
  { id:'mono',   name:'Mono',   color:'#18181B', light:'#3F3F46', p600:'#09090B', p700:'#09090B', p50:'#F4F4F5', p100:'#E4E4E7', p50dk:'#27272A', shadow:'rgba(0,0,0,0.35)'   },
  { id:'teal',   name:'Teal',   color:'#0D9488', light:'#14B8A6', p600:'#0F766E', p700:'#115E59', p50:'#F0FDFA', p100:'#CCFBF1', p50dk:'#082420', shadow:'rgba(13,148,136,0.45)'  },
  { id:'indigo', name:'Indigo', color:'#6366F1', light:'#818CF8', p600:'#4F46E5', p700:'#4338CA', p50:'#EEF2FF', p100:'#C7D2FE', p50dk:'#1a1c4e', shadow:'rgba(99,102,241,0.45)'  },
  { id:'violet', name:'Violet', color:'#8B5CF6', light:'#A78BFA', p600:'#7C3AED', p700:'#6D28D9', p50:'#F5F3FF', p100:'#DDD6FE', p50dk:'#1e1044', shadow:'rgba(139,92,246,0.45)'  },
  { id:'rose',   name:'Rose',   color:'#F43F5E', light:'#FB7185', p600:'#E11D48', p700:'#BE123C', p50:'#FFF1F2', p100:'#FFE4E6', p50dk:'#350d15', shadow:'rgba(244,63,94,0.45)'   },
  { id:'amber',  name:'Amber',  color:'#F59E0B', light:'#FCD34D', p600:'#D97706', p700:'#B45309', p50:'#FFFBEB', p100:'#FDE68A', p50dk:'#2c1c00', shadow:'rgba(245,158,11,0.45)'  },
  { id:'blue',   name:'Blue',   color:'#3B82F6', light:'#60A5FA', p600:'#2563EB', p700:'#1D4ED8', p50:'#EFF6FF', p100:'#BFDBFE', p50dk:'#0a1e40', shadow:'rgba(59,130,246,0.45)'  },
  { id:'green',  name:'Green',  color:'#22C55E', light:'#4ADE80', p600:'#16A34A', p700:'#15803D', p50:'#F0FDF4', p100:'#BBF7D0', p50dk:'#082612', shadow:'rgba(34,197,94,0.45)'   },
  { id:'slate',  name:'Slate',  color:'#64748B', light:'#94A3B8', p600:'#475569', p700:'#334155', p50:'#F8FAFC', p100:'#E2E8F0', p50dk:'#141a24', shadow:'rgba(100,116,139,0.35)' },
];

const THEME_KEY = 'ft_theme';
const DARK_KEY  = 'ft_dark';

function applyTheme(themeId) {
  const theme  = THEMES.find(t => t.id === themeId) || THEMES[0];
  const isDark = document.documentElement.dataset.theme === 'dark';
  const r = document.documentElement.style;
  if (theme.id === 'mono') {
    r.setProperty('--primary',        isDark ? '#FAFAFA' : '#09090B');
    r.setProperty('--primary-light',  isDark ? '#E4E4E7' : '#3F3F46');
    r.setProperty('--primary-600',    isDark ? '#E4E4E7' : '#18181B');
    r.setProperty('--primary-700',    isDark ? '#D4D4D8' : '#27272A');
    r.setProperty('--primary-50',     isDark ? '#27272A' : '#F4F4F5');
    r.setProperty('--primary-100',    isDark ? '#3F3F46' : '#E4E4E7');
    r.setProperty('--primary-shadow', theme.shadow);
  } else {
    r.setProperty('--primary',        theme.color);
    r.setProperty('--primary-light',  theme.light);
    r.setProperty('--primary-600',    theme.p600);
    r.setProperty('--primary-700',    theme.p700);
    r.setProperty('--primary-50',     isDark ? theme.p50dk : theme.p50);
    r.setProperty('--primary-100',    theme.p100);
    r.setProperty('--primary-shadow', theme.shadow);
  }
  localStorage.setItem(THEME_KEY, theme.id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#09090B' : theme.color);
}

function applyDarkMode(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem(DARK_KEY, isDark ? '1' : '0');
  applyTheme(localStorage.getItem(THEME_KEY) || 'mono');
}

const _bootDark = localStorage.getItem(DARK_KEY) === '1';
document.documentElement.setAttribute('data-theme', _bootDark ? 'dark' : 'light');
applyTheme(localStorage.getItem(THEME_KEY) || 'mono');

let currentPage    = 'dashboard';
let currentPageOpts = {};
let pageCleanup    = null;
let pendingConfirm = null;

// ── Boot ──────────────────────────────────────────────────────

async function boot() {
  await store.init();
  initAllIconPickers();

  if (isConfigured()) {
    showApp();
  } else {
    showSetup();
  }
}

function showSetup() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

async function showApp() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  navigate('dashboard');
  updateSyncWidget();

  if (isSupabaseConfigured()) {
    updateSyncWidget('syncing');
    const result = await pullAllFromSupabase(store);
    if (result.ok) {
      updateSyncWidget('synced');
      refreshPage();
    } else {
      updateSyncWidget('error');
    }
  } else if (isConfigured()) {
    const queue = await store.getPendingQueue();
    if (queue && queue.length > 0) {
      updateSyncWidget('pending');
    } else {
      updateSyncWidget('syncing');
      const result = await syncer.pullAll(store);
      if (result.ok) {
        updateSyncWidget('synced');
        navigate('dashboard');
      } else {
        updateSyncWidget('error');
      }
    }
  }
}

// ── Setup form ────────────────────────────────────────────────

document.getElementById('setup-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('setup-submit');
  const errEl = document.getElementById('setup-error');
  const errMsg = document.getElementById('setup-error-msg');

  const cfg = {
    owner:  document.getElementById('setup-owner').value.trim(),
    repo:   document.getElementById('setup-repo').value.trim(),
    branch: document.getElementById('setup-branch').value.trim() || 'main',
    token:  document.getElementById('setup-token').value.trim(),
  };

  btn.disabled = true;
  btn.textContent = 'กำลังเชื่อมต่อ...';
  errEl.classList.add('hidden');

  saveConfig(cfg);
  const result = await syncer.testConnection();

  if (result.ok) {
    showApp();
  } else {
    errEl.classList.remove('hidden');
    errMsg.textContent = result.error || 'ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบ token และชื่อ repository';
    btn.disabled = false;
    btn.textContent = 'เชื่อมต่อและเริ่มต้น';
  }
});

document.getElementById('setup-skip')?.addEventListener('click', () => {
  showApp();
});

// ── Router ────────────────────────────────────────────────────

const PAGE_MAP = {
  dashboard:    initDashboard,
  transactions: initTransactions,
  budget:       initBudget,
  analytics:    initAnalytics,
  accounts:     initAccounts,
  settings:     initSettings,
};

const PAGE_TITLES = {
  dashboard:    'ภาพรวม',
  transactions: 'รายการ',
  budget:       'งบ & บิลประจำ',
  analytics:    'วิเคราะห์',
  accounts:     'บัญชี & หมวดหมู่',
  settings:     'ตั้งค่า',
};

export async function navigate(page, opts = {}) {
  if (!PAGE_MAP[page]) page = 'dashboard';
  currentPage = page;
  currentPageOpts = opts || {};

  // Update nav active state
  document.querySelectorAll('.nav-link[data-page], .bnav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update mobile topbar accounts pill active state
  const topbarAccBtn = document.getElementById('topbar-btn-accounts');
  if (topbarAccBtn) {
    topbarAccBtn.classList.toggle('active', page === 'accounts');
  }

  // Update mobile topbar title
  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.textContent = PAGE_TITLES[page] || '';

  // Cleanup previous page
  if (typeof pageCleanup === 'function') {
    pageCleanup();
    pageCleanup = null;
  }

  // Render new page
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="page-loading">กำลังโหลด...</div>';

  try {
    const cleanup = await PAGE_MAP[page](content, store, {
      openTxModal,
      showToast,
      showConfirm,
      navigate,
      refreshPage: () => navigate(page, currentPageOpts),
      ...currentPageOpts,
    });
    pageCleanup = cleanup || null;
  } catch (err) {
    console.error(`Page ${page} error:`, err);
    content.innerHTML = `<div class="page-error"><strong>เกิดข้อผิดพลาด</strong><br/>${err.message}</div>`;
  }
}

function refreshPage() {
  navigate(currentPage, currentPageOpts);
}

// ── Nav & Global Action Delegation ────────────────────────────

document.getElementById('main-app')?.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-page]');
  if (navEl && navEl.dataset.page) {
    e.preventDefault();
    const tab = navEl.dataset.tab;
    navigate(navEl.dataset.page, tab ? { tab } : {});
    return;
  }

  // Add transaction buttons (Docked Bottom Nav + Desktop Sidebar + Page Top)
  if (
    e.target.closest('#btn-add-tx-fab') ||
    e.target.closest('#btn-sidebar-add') ||
    e.target.closest('#btn-add-tx-top')
  ) {
    openTxModal();
    return;
  }

  // 1-Tap Slip Scan buttons (Docked Bottom Nav + Desktop Sidebar + Topbar)
  if (
    e.target.closest('#btn-slip-fab') ||
    e.target.closest('#btn-sidebar-scan') ||
    e.target.closest('#topbar-btn-slip')
  ) {
    triggerSlipScan();
    return;
  }
});

// Scan slip button inside tx-modal header
document.getElementById('btn-tx-modal-scan-slip')?.addEventListener('click', () => {
  closeModal('tx-modal');
  triggerSlipScan();
});

// ── Sync ──────────────────────────────────────────────────────

document.getElementById('btn-sync')?.addEventListener('click', doSync);
document.getElementById('topbar-btn-sync')?.addEventListener('click', doSync);
document.getElementById('topbar-btn-settings')?.addEventListener('click', () => navigate('settings'));

async function doSync() {
  if (isSupabaseConfigured()) {
    updateSyncWidget('syncing');
    const result = await pullAllFromSupabase(store);
    if (result.ok) {
      updateSyncWidget('synced');
      showToast(`ซิงค์ข้อมูลกับ Supabase สำเร็จ (${result.count} รายการ)`);
      refreshPage();
    } else {
      updateSyncWidget('error');
      showToast('ซิงค์ล้มเหลว: ' + result.error, 'error');
    }
    return;
  }

  if (!isConfigured()) {
    showToast('ยังไม่ได้ตั้งค่า Cloud หรือ GitHub', 'error');
    return;
  }
  updateSyncWidget('syncing');
  const result = await syncer.syncAll(store);
  if (result.ok) {
    updateSyncWidget('synced');
    showToast('Sync สำเร็จ');
    refreshPage();
  } else {
    updateSyncWidget('error');
    showToast('Sync ล้มเหลว: ' + result.error, 'error');
  }
}

let _isPulling = false;
async function pullLatestIfVisible() {
  if (_isPulling || !isSupabaseConfigured()) return;
  _isPulling = true;
  try {
    updateSyncWidget('syncing');
    const result = await pullAllFromSupabase(store);
    if (result.ok) {
      updateSyncWidget('synced');
      refreshPage();
    } else {
      updateSyncWidget('error');
    }
  } catch (err) {
    console.error('Auto-pull error:', err);
    updateSyncWidget('error');
  } finally {
    _isPulling = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    pullLatestIfVisible();
  }
});

window.addEventListener('focus', () => {
  pullLatestIfVisible();
});

function updateSyncWidget(stateOverride) {
  const state = stateOverride || getSyncState();
  const dot   = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!dot || !label) return;

  const topbarDot = document.getElementById('topbar-sync-dot');

  const applyState = (d, l) => {
    if (!d) return;
    d.className = 'sync-dot';
    switch (state) {
      case 'synced':   d.classList.add('synced');  if (l) l.textContent = 'พร้อมใช้งาน'; break;
      case 'pending':  d.classList.add('pending'); if (l) l.textContent = 'รอซิงค์';     break;
      case 'syncing':  d.classList.add('syncing'); if (l) l.textContent = 'กำลังซิงค์…'; break;
      case 'error':    d.classList.add('error');   if (l) l.textContent = 'ซิงค์ขัดข้อง'; break;
      case 'conflict': d.classList.add('error');   if (l) l.textContent = 'ข้อมูลชนกัน';  break;
      default:         d.classList.add('offline'); if (l) l.textContent = 'ออฟไลน์';    break;
    }
  };

  applyState(dot, label);
  applyState(topbarDot, null);
}

// ── 1-Tap Chip Grid Helper (Synced with Hidden <select>) ─────

function renderChipSelector(chipContainerId, selectId, items, selectedId = null, fallbackIcon = 'box') {
  const selectEl = document.getElementById(selectId);
  const chipContainer = document.getElementById(chipContainerId);
  if (!selectEl && !chipContainer) return;

  const activeId = (selectedId && items.some(it => it.id === selectedId))
    ? selectedId
    : (items[0]?.id || '');

  if (selectEl) {
    selectEl.innerHTML = items.map(it => `<option value="${it.id}">${it.name}</option>`).join('');
    selectEl.value = activeId;
  }

  if (chipContainer) {
    chipContainer.innerHTML = items.map(it => {
      const isSelected = it.id === activeId;
      return `
        <button type="button" class="quick-chip ${isSelected ? 'selected' : ''}" data-val="${it.id}">
          ${renderIcon(it.icon || fallbackIcon, 15)}
          <span>${it.name}</span>
        </button>
      `;
    }).join('');

    chipContainer.querySelectorAll('.quick-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        chipContainer.querySelectorAll('.quick-chip').forEach(b => {
          b.classList.toggle('selected', b.dataset.val === val);
        });
        if (selectEl) {
          selectEl.value = val;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  }
}

// ── Transaction modal (1-Tap Chip Selectors) ─────────────────

let txModalEditId = null;

async function openTxModal(txId = null) {
  txModalEditId = txId;

  const titleEl   = document.getElementById('tx-modal-title');
  const deleteBtn = document.getElementById('btn-delete-tx');
  const idInput   = document.getElementById('tx-id');

  const [accounts, categories] = await Promise.all([
    store.getAccounts(),
    store.getCategories(),
  ]);

  const expCats = categories.filter(c => c.type === 'expense' || c.type === 'both');
  const incCats = categories.filter(c => c.type === 'income'  || c.type === 'both');

  if (txId) {
    const tx = await store.get('transactions', txId);
    if (!tx) return;

    titleEl.textContent = 'แก้ไขรายการ';
    deleteBtn.classList.remove('hidden');
    idInput.value = tx.id;

    await setTxType(tx.type, tx.categoryId);

    document.getElementById('tx-amount').value = (tx.amountMinor / 100).toFixed(2);
    document.getElementById('tx-date').value   = tx.date;
    document.getElementById('tx-note').value   = tx.note || '';

    if (tx.type === 'transfer') {
      renderChipSelector('tx-account-chips', 'tx-account', accounts, accounts[0]?.id, 'credit-card');
      renderChipSelector('tx-from-account-chips', 'tx-from-account', accounts, tx.fromAccountId, 'credit-card');
      renderChipSelector('tx-to-account-chips', 'tx-to-account', accounts, tx.toAccountId, 'credit-card');
    } else {
      renderChipSelector('tx-account-chips', 'tx-account', accounts, tx.accountId, 'credit-card');
      renderChipSelector('tx-from-account-chips', 'tx-from-account', accounts, tx.accountId, 'credit-card');
      renderChipSelector('tx-to-account-chips', 'tx-to-account', accounts, accounts[1]?.id || accounts[0]?.id, 'credit-card');
      const targetCats = tx.type === 'income' ? incCats : expCats;
      renderChipSelector('tx-category-chips', 'tx-category', targetCats, tx.categoryId, 'box');
    }

    const isAdv = Boolean(tx.isAdvance);
    const advCheck = document.getElementById('tx-is-advance');
    const advBox   = document.getElementById('tx-advance-details');
    const advInput = document.getElementById('tx-advance-to');
    if (advCheck) advCheck.checked = isAdv;
    if (advBox) advBox.classList.toggle('hidden', !isAdv);
    if (advInput) advInput.value = tx.advanceTo || '';
  } else {
    titleEl.textContent = 'จดรายการ';
    deleteBtn.classList.add('hidden');
    idInput.value = '';

    renderChipSelector('tx-account-chips', 'tx-account', accounts, accounts[0]?.id, 'credit-card');
    renderChipSelector('tx-from-account-chips', 'tx-from-account', accounts, accounts[0]?.id, 'credit-card');
    renderChipSelector('tx-to-account-chips', 'tx-to-account', accounts, accounts[1]?.id || accounts[0]?.id, 'credit-card');
    renderChipSelector('tx-category-chips', 'tx-category', expCats, expCats[0]?.id, 'box');

    await setTxType('expense', expCats[0]?.id);
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-date').value   = todayStr();
    document.getElementById('tx-note').value   = '';

    const advCheck = document.getElementById('tx-is-advance');
    const advBox   = document.getElementById('tx-advance-details');
    const advInput = document.getElementById('tx-advance-to');
    if (advCheck) advCheck.checked = false;
    if (advBox) advBox.classList.add('hidden');
    if (advInput) advInput.value = '';
  }

  openModal('tx-modal');
}

async function setTxType(type, preferredCatId = null) {
  const idEl = document.getElementById('tx-id');
  if (idEl) idEl.dataset.type = type;

  document.querySelectorAll('#tx-type-tabs .type-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  const isTransfer = type === 'transfer';
  const isIncome   = type === 'income';
  const amtInp     = document.getElementById('tx-amount');
  if (amtInp) {
    amtInp.style.color = isIncome ? 'var(--income)' : (isTransfer ? 'var(--primary)' : 'var(--expense)');
  }

  document.getElementById('grp-account')?.classList.toggle('hidden', isTransfer);
  document.getElementById('grp-from-account')?.classList.toggle('hidden', !isTransfer);
  document.getElementById('grp-to-account')?.classList.toggle('hidden', !isTransfer);
  document.getElementById('grp-category')?.classList.toggle('hidden', isTransfer);
  document.getElementById('grp-advance')?.classList.toggle('hidden', type !== 'expense');

  if (!isTransfer) {
    const cats = await store.getCategories();
    const filtered = cats.filter(c => c.type === type || c.type === 'both');
    const curSel = preferredCatId || document.getElementById('tx-category')?.value;
    renderChipSelector('tx-category-chips', 'tx-category', filtered, curSel, 'box');
  }
}

document.getElementById('tx-type-tabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.type-tab');
  if (tab) setTxType(tab.dataset.type);
});

document.getElementById('tx-is-advance')?.addEventListener('change', (e) => {
  document.getElementById('tx-advance-details')?.classList.toggle('hidden', !e.target.checked);
});

document.getElementById('tx-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const activeTabs  = document.querySelector('#tx-type-tabs .type-tab.active');
  const type        = activeTabs?.dataset.type || 'expense';
  const amountMinor = parseAmount(document.getElementById('tx-amount').value);
  const date        = document.getElementById('tx-date').value;
  const note        = document.getElementById('tx-note').value.trim();
  const editId      = document.getElementById('tx-id').value;

  if (!amountMinor || amountMinor <= 0) {
    showToast('กรุณาระบุจำนวนเงิน', 'error');
    return;
  }

  let txData;
  if (type === 'transfer') {
    const fromId = document.getElementById('tx-from-account').value;
    const toId   = document.getElementById('tx-to-account').value;
    if (!fromId || !toId) {
      showToast('กรุณาเลือกบัญชีต้นทางและปลายทาง', 'error');
      return;
    }
    if (fromId === toId) {
      showToast('ไม่สามารถโอนเงินเข้าบัญชีเดียวกันได้', 'error');
      return;
    }
    txData = {
      type, amountMinor, date, note,
      fromAccountId: fromId,
      toAccountId:   toId,
    };
  } else {
    const isAdv = document.getElementById('tx-is-advance')?.checked && type === 'expense';
    const advTo = document.getElementById('tx-advance-to')?.value.trim();
    txData = {
      type, amountMinor, date, note,
      accountId:  document.getElementById('tx-account').value,
      categoryId: isAdv ? 'cat_advance' : document.getElementById('tx-category').value,
      isAdvance:  Boolean(isAdv),
      advanceTo:  isAdv ? (advTo || 'เพื่อน') : '',
      advanceStatus: isAdv ? 'pending' : null,
    };
  }

  if (editId) {
    const existing = await store.get('transactions', editId);
    if (existing) {
      Object.assign(existing, txData, { updatedAt: new Date().toISOString(), synced: true, pendingOp: 'update' });
      await store.put('transactions', existing);
      await store.addToPendingQueue({ id: editId, store: 'transactions', op: 'update' });
      syncTransaction(existing).catch(console.error);
    }
  } else {
    const tx = makeTransaction(txData);
    tx.synced = true;
    await store.put('transactions', tx);
    await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
    syncTransaction(tx).catch(console.error);
  }

  if (type === 'expense' && txData.categoryId && note) {
    learnHabit({ memo: note, categoryId: txData.categoryId });
  }

  closeModal('tx-modal');
  showToast(editId ? 'แก้ไขรายการแล้ว' : 'บันทึกรายการแล้ว');
  updateSyncWidget('synced');
  refreshPage();
});

document.getElementById('btn-delete-tx')?.addEventListener('click', async () => {
  const editId = document.getElementById('tx-id').value;
  if (!editId) return;

  const ok = await showConfirm('ลบรายการ', 'ต้องการลบรายการนี้หรือไม่?');
  if (!ok) return;

  await store.softDelete('transactions', editId);
  await store.addToPendingQueue({ id: editId, store: 'transactions', op: 'delete' });
  deleteSupabaseTransaction(editId).catch(console.error);
  closeModal('tx-modal');
  showToast('ลบรายการแล้ว');
  updateSyncWidget('synced');
  refreshPage();
});


// ── Slip modal (1-Tap Trigger, Compact Review & Lightbox) ────

let slipQueue = [];
let currentSlipIndex = 0;
let currentParsedData = null;
let currentThumbUrl = null;
let isProcessingSlip = false;
let isSplitMode = false;
let splitItems = [];
let allLoadedCategories = [];
let allLoadedAccounts = [];
let currentSlipType = 'expense';

function revokeCurrentThumb() {
  if (currentThumbUrl) {
    URL.revokeObjectURL(currentThumbUrl);
    currentThumbUrl = null;
  }
}

function resetSlipModalState() {
  revokeCurrentThumb();
  slipQueue = [];
  currentSlipIndex = 0;
  currentParsedData = null;
  isProcessingSlip = false;
  setSplitMode(false);
  splitItems = [];

  const slipAdvCheck = document.getElementById('slip-is-advance');
  const slipAdvBox   = document.getElementById('slip-advance-details');
  const slipAdvInput = document.getElementById('slip-advance-to');
  if (slipAdvCheck) slipAdvCheck.checked = false;
  if (slipAdvBox) slipAdvBox.classList.add('hidden');
  if (slipAdvInput) slipAdvInput.value = '';

  document.getElementById('slip-drop-section')?.classList.remove('hidden');
  document.getElementById('slip-loading-section')?.classList.add('hidden');
  document.getElementById('slip-preview-section')?.classList.add('hidden');
  document.getElementById('slip-queue-badge')?.classList.add('hidden');

  const fileInput = document.getElementById('slip-file-input');
  if (fileInput) fileInput.value = '';
}

/**
 * 1-Tap Slip Scan Trigger:
 * Opens native file/camera picker immediately if Gemini API key is configured,
 * while also preparing #slip-modal so desktop drag-and-drop works seamlessly.
 */
function triggerSlipScan() {
  resetSlipModalState();
  openModal('slip-modal');
  if (getGeminiKey()) {
    document.getElementById('slip-file-input')?.click();
  }
}

async function openSlipModal() {
  resetSlipModalState();
  openModal('slip-modal');
}
window.openSlipModal = openSlipModal;

function setSlipType(type, preferredCatId = null) {
  currentSlipType = type || 'expense';
  document.querySelectorAll('#slip-type-tabs .type-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === currentSlipType);
  });

  const isTransfer = currentSlipType === 'transfer';
  const isIncome   = currentSlipType === 'income';

  const amountInp      = document.getElementById('slip-amount');
  const grpAcc         = document.getElementById('grp-slip-account');
  const grpXfer        = document.getElementById('grp-slip-transfer');
  const lblAcc         = document.getElementById('lbl-slip-account');
  const grpSplitToggle = document.getElementById('grp-slip-split-toggle');
  const grpCat         = document.getElementById('grp-slip-category');
  const grpAdv         = document.getElementById('grp-slip-advance');

  if (amountInp) {
    amountInp.style.color = isIncome ? 'var(--income)' : (isTransfer ? 'var(--primary)' : 'var(--expense)');
  }

  if (grpAcc) grpAcc.classList.toggle('hidden', isTransfer);
  if (grpXfer) grpXfer.classList.toggle('hidden', !isTransfer);
  if (lblAcc) lblAcc.textContent = isIncome ? 'บัญชีที่รับเงิน' : 'บัญชีที่จ่าย';

  if (grpSplitToggle) grpSplitToggle.classList.toggle('hidden', isTransfer);
  if (grpCat) grpCat.classList.toggle('hidden', isTransfer);
  if (grpAdv) grpAdv.classList.toggle('hidden', currentSlipType !== 'expense');

  if (isTransfer) {
    setSplitMode(false);
  } else {
    const filtered = allLoadedCategories.filter(c => c.type === currentSlipType || c.type === 'both');
    if (filtered.length) {
      const prevVal = preferredCatId || document.getElementById('slip-category')?.value;
      renderChipSelector('slip-category-chips', 'slip-category', filtered, prevVal, 'box');
    }
    if (isSplitMode) {
      renderSplitItems();
    }
  }
}

document.getElementById('slip-type-tabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.type-tab');
  if (tab) setSlipType(tab.dataset.type);
});

function setSplitMode(enabled) {
  isSplitMode = enabled;
  const toggleBtn = document.getElementById('btn-toggle-split');
  const singleSec = document.getElementById('slip-single-section');
  const splitSec  = document.getElementById('slip-split-section');

  if (toggleBtn) {
    toggleBtn.innerHTML = enabled
      ? `${renderIcon('chevron-left', 13)}<span>รวมเป็น 1 รายการ</span>`
      : `${renderIcon('split', 13)}<span>แยกหลายหมวด</span>`;
  }
  singleSec?.classList.toggle('hidden', enabled);
  splitSec?.classList.toggle('hidden', !enabled);

  if (enabled) {
    if (!splitItems.length) {
      const fullAmtMinor = parseAmount(document.getElementById('slip-amount')?.value) || currentParsedData?.amountMinor || 0;
      const filteredCats = allLoadedCategories.filter(c => c.type === currentSlipType || c.type === 'both');
      const catId = document.getElementById('slip-category')?.value || (filteredCats[0]?.id || 'cat_food');
      const note = document.getElementById('slip-note')?.value || currentParsedData?.memo || '';
      splitItems = [{
        id: Math.random().toString(36).slice(2, 8),
        categoryId: catId,
        amountMinor: fullAmtMinor,
        note: note,
        isAdvance: false,
        advanceTo: '',
      }];
    }
    renderSplitItems();
  } else {
    document.getElementById('btn-slip-save')?.removeAttribute('disabled');
  }
}

function renderSplitItems() {
  const container = document.getElementById('split-items-container');
  updateCountdownBannerOnly();
  if (!container) return;

  const filteredCats = allLoadedCategories.filter(c => c.type === currentSlipType || c.type === 'both');
  const catOpts = (selectedCatId) => filteredCats
    .map(c => `<option value="${c.id}" ${c.id === selectedCatId ? 'selected' : ''}>${c.name}</option>`)
    .join('');

  container.innerHTML = splitItems.map(item => `
    <div class="split-row" data-id="${item.id}">
      <div class="split-row-top">
        <select class="split-item-cat" style="flex:1" data-id="${item.id}">
          ${catOpts(item.categoryId)}
        </select>
        <input type="number" step="any" class="mono split-item-amt" data-id="${item.id}" value="${(item.amountMinor / 100).toFixed(2)}" placeholder="0.00" style="width:110px;font-weight:700" />
        ${splitItems.length > 1 ? `<button type="button" class="icon-btn btn-del-split" data-id="${item.id}" title="ลบรายการนี้" style="color:var(--expense)">✕</button>` : ''}
      </div>
      <div class="split-row-bottom">
        <input type="text" class="split-item-note" data-id="${item.id}" value="${item.note || ''}" placeholder="โน้ตย่อย (เช่น ชาบูนาย A, ขนม)" style="flex:1;font-size:12px" />
        ${currentSlipType === 'expense' ? `
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;white-space:nowrap">
            <input type="checkbox" class="split-item-advance-check" data-id="${item.id}" ${item.isAdvance ? 'checked' : ''} />
            <span>ฝากจ่าย</span>
          </label>
        ` : ''}
      </div>
      <div class="split-advance-box ${item.isAdvance ? '' : 'hidden'}" id="adv-box-${item.id}">
        <input type="text" class="split-item-advance-to" data-id="${item.id}" value="${item.advanceTo || ''}" placeholder="ระบุชื่อเพื่อน (เช่น บอย)" style="font-size:12px;padding:4px 8px;width:100%" />
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.split-item-amt').forEach(inp => {
    inp.addEventListener('input', () => {
      const it = splitItems.find(x => x.id === inp.dataset.id);
      if (it) {
        it.amountMinor = parseAmount(inp.value);
        updateCountdownBannerOnly();
      }
    });
  });

  container.querySelectorAll('.split-item-cat').forEach(sel => {
    sel.addEventListener('change', () => {
      const it = splitItems.find(x => x.id === sel.dataset.id);
      if (it) it.categoryId = sel.value;
    });
  });

  container.querySelectorAll('.split-item-note').forEach(inp => {
    inp.addEventListener('input', () => {
      const it = splitItems.find(x => x.id === inp.dataset.id);
      if (it) it.note = inp.value;
    });
  });

  container.querySelectorAll('.split-item-advance-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const it = splitItems.find(x => x.id === chk.dataset.id);
      if (it) {
        it.isAdvance = chk.checked;
        const advBox = document.getElementById(`adv-box-${it.id}`);
        advBox?.classList.toggle('hidden', !chk.checked);
        if (chk.checked) it.categoryId = 'cat_advance';
      }
    });
  });

  container.querySelectorAll('.split-item-advance-to').forEach(inp => {
    inp.addEventListener('input', () => {
      const it = splitItems.find(x => x.id === inp.dataset.id);
      if (it) it.advanceTo = inp.value;
    });
  });

  container.querySelectorAll('.btn-del-split').forEach(btn => {
    btn.addEventListener('click', () => {
      splitItems = splitItems.filter(x => x.id !== btn.dataset.id);
      renderSplitItems();
    });
  });
}

function updateCountdownBannerOnly() {
  const banner = document.getElementById('split-countdown-banner');
  const remainingVal = document.getElementById('split-remaining-val');
  const saveBtn = document.getElementById('btn-slip-save');
  const fullSlipAmountMinor = parseAmount(document.getElementById('slip-amount')?.value) || 0;

  const allocatedMinor = splitItems.reduce((s, it) => s + (it.amountMinor || 0), 0);
  const remainingMinor = fullSlipAmountMinor - allocatedMinor;

  if (banner && remainingVal) {
    banner.className = 'split-banner';
    if (remainingMinor === 0) {
      banner.classList.add('matched');
      banner.querySelector('span:first-child').textContent = 'จัดสรรครบลงตัวพอดี:';
      remainingVal.textContent = '0.00 ฿';
      if (saveBtn) saveBtn.disabled = false;
    } else if (remainingMinor > 0) {
      banner.classList.add('pending');
      banner.querySelector('span:first-child').textContent = 'คงเหลือต้องจัดสรร:';
      remainingVal.textContent = `${(remainingMinor / 100).toFixed(2)} ฿`;
      if (saveBtn) saveBtn.disabled = true;
    } else {
      banner.classList.add('over');
      banner.querySelector('span:first-child').textContent = 'เกินยอดสลิปไป:';
      remainingVal.textContent = `${(Math.abs(remainingMinor) / 100).toFixed(2)} ฿`;
      if (saveBtn) saveBtn.disabled = true;
    }
  }
}

document.getElementById('btn-toggle-split')?.addEventListener('click', () => {
  setSplitMode(!isSplitMode);
});

document.getElementById('btn-add-split-item')?.addEventListener('click', () => {
  const fullSlipAmountMinor = parseAmount(document.getElementById('slip-amount')?.value) || 0;
  const allocatedMinor = splitItems.reduce((sum, item) => sum + (item.amountMinor || 0), 0);
  const remainingMinor = Math.max(0, fullSlipAmountMinor - allocatedMinor);
  const filteredCats = allLoadedCategories.filter(c => c.type === currentSlipType || c.type === 'both');
  splitItems.push({
    id: Math.random().toString(36).slice(2, 8),
    categoryId: filteredCats[0]?.id || 'cat_food',
    amountMinor: remainingMinor,
    note: '',
    isAdvance: false,
    advanceTo: '',
  });
  renderSplitItems();
});

document.getElementById('btn-fill-remaining')?.addEventListener('click', () => {
  if (!splitItems.length) return;
  const fullSlipAmountMinor = parseAmount(document.getElementById('slip-amount')?.value) || 0;
  const otherAllocated = splitItems.slice(0, -1).reduce((sum, item) => sum + (item.amountMinor || 0), 0);
  const remainingForLast = Math.max(0, fullSlipAmountMinor - otherAllocated);
  splitItems[splitItems.length - 1].amountMinor = remainingForLast;
  renderSplitItems();
});

document.getElementById('slip-is-advance')?.addEventListener('change', (e) => {
  document.getElementById('slip-advance-details')?.classList.toggle('hidden', !e.target.checked);
});

document.getElementById('slip-amount')?.addEventListener('input', () => {
  if (isSplitMode) updateCountdownBannerOnly();
});

// Slip Thumbnail Zoom Lightbox
document.getElementById('btn-zoom-slip')?.addEventListener('click', () => {
  const lightbox = document.getElementById('slip-lightbox');
  const fullImg  = document.getElementById('slip-lightbox-img');
  const thumbImg = document.getElementById('slip-thumb-img');
  const src      = currentThumbUrl || thumbImg?.src;
  if (lightbox && fullImg && src) {
    fullImg.src = src;
    lightbox.classList.remove('hidden');
  }
});

document.getElementById('btn-close-lightbox')?.addEventListener('click', () => {
  document.getElementById('slip-lightbox')?.classList.add('hidden');
});

document.getElementById('slip-lightbox')?.addEventListener('click', (e) => {
  if (e.target.id === 'slip-lightbox') {
    e.target.classList.add('hidden');
  }
});

async function handleSlipFiles(files) {
  if (!files || !files.length) return;

  const apiKey = getGeminiKey();
  if (!apiKey) {
    showToast('กรุณาระบุ Gemini API Key ในหน้าตั้งค่าก่อนสแกนสลิป', 'error');
    closeModal('slip-modal');
    navigate('settings');
    return;
  }

  openModal('slip-modal');
  slipQueue = Array.from(files);
  currentSlipIndex = 0;
  await processCurrentSlip();
}

async function processCurrentSlip() {
  if (isProcessingSlip) return;
  isProcessingSlip = true;

  if (currentSlipIndex >= slipQueue.length) {
    revokeCurrentThumb();
    closeModal('slip-modal');
    showToast(`สแกนและบันทึกสลิปเรียบร้อย (${slipQueue.length} ใบ)`);
    isProcessingSlip = false;
    refreshPage();
    return;
  }

  const dropSec = document.getElementById('slip-drop-section');
  const loadSec = document.getElementById('slip-loading-section');
  const prevSec = document.getElementById('slip-preview-section');
  const badge   = document.getElementById('slip-queue-badge');
  const loadTxt = document.getElementById('slip-loading-text');
  const saveBtn = document.getElementById('btn-slip-save');
  const skipBtn = document.getElementById('btn-slip-skip');

  if (saveBtn) saveBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;

  dropSec?.classList.add('hidden');
  prevSec?.classList.add('hidden');
  loadSec?.classList.remove('hidden');

  if (badge) {
    badge.textContent = `สลิป ${currentSlipIndex + 1}/${slipQueue.length}`;
    badge.classList.remove('hidden');
  }
  if (loadTxt) {
    loadTxt.textContent = `กำลังวิเคราะห์สลิปใบที่ ${currentSlipIndex + 1} จาก ${slipQueue.length}...`;
  }

  const rawFile = slipQueue[currentSlipIndex];

  try {
    const compressedBlob = await compressImage(rawFile, 1280, 0.82);

    revokeCurrentThumb();
    const thumbImg = document.getElementById('slip-thumb-img');
    if (thumbImg) {
      currentThumbUrl = URL.createObjectURL(compressedBlob);
      thumbImg.src = currentThumbUrl;
    }

    const apiKey = getGeminiKey();
    const parsed = await parseSlipImage(compressedBlob, apiKey);
    currentParsedData = parsed;
    await populateSlipPreview(parsed);
  } catch (err) {
    console.error('Slip parse error:', err);
    showToast(`สลิปใบที่ ${currentSlipIndex + 1}: ${err.message}`, 'error');
    currentParsedData = {
      amountMinor: 0,
      date: todayStr(),
      time: '',
      bank: '',
      memo: '',
      bankCategoryTag: '',
      payeeAccount: '',
    };
    await populateSlipPreview(currentParsedData);
  } finally {
    if (saveBtn && (!isSplitMode || splitItems.length === 0)) saveBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
    isProcessingSlip = false;
  }
}

async function populateSlipPreview(parsed) {
  const [accounts, categories] = await Promise.all([
    store.getAccounts(),
    store.getCategories(),
  ]);

  allLoadedAccounts = accounts;
  allLoadedCategories = categories;
  setSplitMode(false);
  splitItems = [];

  const slipAdvCheck = document.getElementById('slip-is-advance');
  const slipAdvBox   = document.getElementById('slip-advance-details');
  const slipAdvInput = document.getElementById('slip-advance-to');
  if (slipAdvCheck) slipAdvCheck.checked = false;
  if (slipAdvBox) slipAdvBox.classList.add('hidden');
  if (slipAdvInput) slipAdvInput.value = '';

  const fromSelect = document.getElementById('slip-from-account');
  const toSelect   = document.getElementById('slip-to-account');
  const accOptions = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  if (fromSelect) fromSelect.innerHTML = accOptions;
  if (toSelect) {
    toSelect.innerHTML = accOptions;
    if (accounts.length > 1) toSelect.value = accounts[1].id;
  }

  const habitData = getHabitData();
  const matchedAccId = matchBankToAccount(parsed.bank, accounts, habitData) || accounts[0]?.id;
  renderChipSelector('slip-account-chips', 'slip-account', accounts, matchedAccId, 'credit-card');
  if (matchedAccId && fromSelect) fromSelect.value = matchedAccId;

  const initialType = parsed.type === 'income' ? 'income' : 'expense';
  const filteredCats = categories.filter(c => c.type === initialType || c.type === 'both');
  let suggestedCatId = filteredCats[0]?.id;
  if (filteredCats.length) {
    suggestedCatId = suggestCategory({
      memo: parsed.memo,
      bankCategoryTag: parsed.bankCategoryTag,
      payeeKey: parsed.payeeAccount,
      categories: filteredCats,
    }) || filteredCats[0]?.id;
  }

  setSlipType(initialType, suggestedCatId);

  const amountInput = document.getElementById('slip-amount');
  const dateInput   = document.getElementById('slip-date');
  const noteInput   = document.getElementById('slip-note');

  if (amountInput) amountInput.value = (parsed.amountMinor / 100).toFixed(2);
  if (dateInput)   dateInput.value   = parsed.date || todayStr();
  if (noteInput)   noteInput.value   = parsed.memo || '';

  document.getElementById('slip-loading-section')?.classList.add('hidden');
  document.getElementById('slip-preview-section')?.classList.remove('hidden');
}

document.getElementById('slip-confirm-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isProcessingSlip) return;

  const saveBtn = document.getElementById('btn-slip-save');
  const skipBtn = document.getElementById('btn-slip-skip');
  if (saveBtn) saveBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;

  const fullAmountMinor = parseAmount(document.getElementById('slip-amount').value);
  const date            = document.getElementById('slip-date').value;

  if (!fullAmountMinor || fullAmountMinor <= 0) {
    showToast('กรุณาระบุจำนวนเงิน', 'error');
    if (saveBtn) saveBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
    return;
  }

  if (currentSlipType === 'transfer') {
    const fromId = document.getElementById('slip-from-account').value;
    const toId   = document.getElementById('slip-to-account').value;
    const note   = document.getElementById('slip-note').value.trim();

    if (!fromId || !toId) {
      showToast('กรุณาเลือกบัญชีต้นทางและปลายทาง', 'error');
      if (saveBtn) saveBtn.disabled = false;
      if (skipBtn) skipBtn.disabled = false;
      return;
    }
    if (fromId === toId) {
      showToast('ไม่สามารถโอนเงินเข้าบัญชีเดียวกันได้', 'error');
      if (saveBtn) saveBtn.disabled = false;
      if (skipBtn) skipBtn.disabled = false;
      return;
    }

    const tx = makeTransaction({
      type: 'transfer',
      amountMinor: fullAmountMinor,
      date,
      fromAccountId: fromId,
      toAccountId: toId,
      note,
    });
    await store.put('transactions', tx);
    await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
    syncTransaction(tx).catch(console.error);

  } else if (isSplitMode) {
    const allocatedMinor = splitItems.reduce((s, it) => s + (it.amountMinor || 0), 0);
    if (allocatedMinor !== fullAmountMinor) {
      showToast('กรุณาจัดสรรยอดให้ลงตัวพอดี 0.00 ฿ ก่อนบันทึก', 'error');
      if (saveBtn) saveBtn.disabled = false;
      if (skipBtn) skipBtn.disabled = false;
      return;
    }

    const accountId = document.getElementById('slip-account').value;
    const splitGroupId = genId('split');
    for (const item of splitItems) {
      if (!item.amountMinor || item.amountMinor <= 0) continue;
      const isAdv = currentSlipType === 'expense' && Boolean(item.isAdvance);
      const tx = makeTransaction({
        type: currentSlipType,
        amountMinor: item.amountMinor,
        date,
        accountId,
        categoryId: isAdv ? 'cat_advance' : item.categoryId,
        note: item.note,
        splitGroupId,
        isAdvance: isAdv,
        advanceTo: isAdv ? (item.advanceTo || 'เพื่อน') : '',
        advanceStatus: isAdv ? 'pending' : null,
      });

      await store.put('transactions', tx);
      await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
      syncTransaction(tx).catch(console.error);

      if (!isAdv && item.categoryId && item.note) {
        learnHabit({ memo: item.note, categoryId: item.categoryId });
      }
    }
  } else {
    const accountId   = document.getElementById('slip-account').value;
    const categoryId  = document.getElementById('slip-category').value;
    const note        = document.getElementById('slip-note').value.trim();
    const isAdv       = currentSlipType === 'expense' && document.getElementById('slip-is-advance')?.checked;
    const advTo       = document.getElementById('slip-advance-to')?.value.trim();

    const tx = makeTransaction({
      type: currentSlipType,
      amountMinor: fullAmountMinor,
      date,
      accountId,
      categoryId: isAdv ? 'cat_advance' : categoryId,
      note,
      isAdvance: Boolean(isAdv),
      advanceTo: isAdv ? (advTo || 'เพื่อน') : '',
      advanceStatus: isAdv ? 'pending' : null,
    });

    await store.put('transactions', tx);
    await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
    syncTransaction(tx).catch(console.error);

    if (!isAdv && categoryId) {
      learnHabit({
        memo: note,
        payeeKey: currentParsedData?.payeeAccount,
        categoryId,
        bankOrApp: currentParsedData?.bank,
        accountId,
      });
    }
  }

  updateSyncWidget('synced');
  showToast(`บันทึกสลิปใบที่ ${currentSlipIndex + 1} แล้ว`);

  currentSlipIndex++;
  await processCurrentSlip();
});

document.getElementById('btn-slip-skip')?.addEventListener('click', async () => {
  if (isProcessingSlip) return;
  const saveBtn = document.getElementById('btn-slip-save');
  const skipBtn = document.getElementById('btn-slip-skip');
  if (saveBtn) saveBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;

  showToast(`ข้ามสลิปใบที่ ${currentSlipIndex + 1}`);
  currentSlipIndex++;
  await processCurrentSlip();
});

document.getElementById('btn-browse-slips')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('slip-file-input')?.click();
});

document.getElementById('slip-file-input')?.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length) {
    handleSlipFiles(e.target.files);
  }
});

const slipDropzone = document.getElementById('slip-dropzone');
if (slipDropzone) {
  slipDropzone.addEventListener('click', (e) => {
    if (!e.target.closest('#btn-browse-slips')) {
      document.getElementById('slip-file-input')?.click();
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    slipDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      slipDropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    slipDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      slipDropzone.classList.remove('dragover');
    });
  });

  slipDropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) {
      handleSlipFiles(dt.files);
    }
  });
}

// ── Account modal ─────────────────────────────────────────────

window.openAccountModal = async function(accountId = null) {
  const titleEl      = document.getElementById('account-modal-title');
  const deleteBtn    = document.getElementById('btn-delete-account');
  const archiveBtn   = document.getElementById('btn-archive-account');
  const idInput      = document.getElementById('account-id');

  if (accountId) {
    const acc = await store.get('accounts', accountId);
    if (!acc) return;
    titleEl.textContent = 'แก้ไขบัญชี';
    deleteBtn.classList.remove('hidden');
    archiveBtn.classList.remove('hidden');
    archiveBtn.textContent = acc.archived ? 'กู้คืนบัญชี' : 'จัดเก็บ';
    idInput.value = acc.id;
    document.getElementById('account-name').value    = acc.name;
    document.getElementById('account-balance').value = (acc.initialBalanceMinor / 100).toFixed(2);
    document.getElementById('account-hidden-check').checked = !!acc.hidden;
    setIconPicker('account-icon-picker', acc.icon || 'credit-card');
  } else {
    titleEl.textContent = 'เพิ่มบัญชี';
    deleteBtn.classList.add('hidden');
    archiveBtn.classList.add('hidden');
    idInput.value = '';
    document.getElementById('account-name').value    = '';
    document.getElementById('account-balance').value = '0';
    document.getElementById('account-hidden-check').checked = false;
    setIconPicker('account-icon-picker', 'credit-card');
  }
  openModal('account-modal');
};

document.getElementById('account-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = document.getElementById('account-id').value;
  const data = {
    name:                document.getElementById('account-name').value.trim(),
    initialBalanceMinor: parseAmount(document.getElementById('account-balance').value),
    icon:                getSelectedIcon('account-icon-picker', 'credit-card'),
    hidden:              document.getElementById('account-hidden-check').checked,
  };

  if (editId) {
    const existing = await store.get('accounts', editId);
    Object.assign(existing, data, { updatedAt: new Date().toISOString(), synced: true });
    await store.put('accounts', existing);
    await store.addToPendingQueue({ id: editId, store: 'accounts', op: 'update' });
    syncAccount(existing).catch(console.error);
  } else {
    const acc = makeAccount(data);
    acc.synced = true;
    await store.put('accounts', acc);
    await store.addToPendingQueue({ id: acc.id, store: 'accounts', op: 'create' });
    syncAccount(acc).catch(console.error);
  }
  updateSyncWidget('synced');

  closeModal('account-modal');
  showToast(editId ? 'แก้ไขบัญชีแล้ว' : 'เพิ่มบัญชีแล้ว');
  refreshPage();
});

document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
  const editId = document.getElementById('account-id').value;
  const ok = await showConfirm('ลบบัญชี', 'ต้องการลบบัญชีนี้หรือไม่? รายการที่ผ่านมาจะยังคงอยู่');
  if (!ok) return;
  await store.softDelete('accounts', editId);
  await store.addToPendingQueue({ id: editId, store: 'accounts', op: 'delete' });
  deleteSupabaseAccount(editId).catch(console.error);
  updateSyncWidget('synced');
  closeModal('account-modal');
  showToast('ลบบัญชีแล้ว');
  refreshPage();
});

document.getElementById('btn-archive-account')?.addEventListener('click', async () => {
  const editId = document.getElementById('account-id').value;
  if (!editId) return;
  const existing = await store.get('accounts', editId);
  if (!existing) return;
  const isArchived = !existing.archived;
  const action = isArchived ? 'กู้คืน' : 'จัดเก็บ';
  const ok = await showConfirm(
    action + 'บัญชี',
    isArchived
      ? 'ต้องการกู้คืนบัญชีนี้กลับมาใช้งานหรือไม่?'
      : 'ต้องการจัดเก็บบัญชีนี้? จะถูกซ่อนจากทุกที่ รายการเดิมยังคงอยู่'
  );
  if (!ok) return;
  Object.assign(existing, { archived: !isArchived, updatedAt: new Date().toISOString(), synced: false });
  await store.put('accounts', existing);
  await store.addToPendingQueue({ id: editId, store: 'accounts', op: 'update' });
  updateSyncWidget('pending');
  closeModal('account-modal');
  showToast(isArchived ? 'กู้คืนบัญชีแล้ว' : 'จัดเก็บบัญชีแล้ว');
  refreshPage();
});

// ── Category modal ────────────────────────────────────────────

window.openCategoryModal = async function(catId = null) {
  const titleEl   = document.getElementById('category-modal-title');
  const deleteBtn = document.getElementById('btn-delete-category');
  const idInput   = document.getElementById('category-id');

  if (catId) {
    const cat = await store.get('categories', catId);
    if (!cat) return;
    titleEl.textContent = 'แก้ไขหมวดหมู่';
    deleteBtn.classList.remove('hidden');
    idInput.value = cat.id;
    document.getElementById('category-name').value = cat.name;
    const radio = document.querySelector(`input[name="cat-type"][value="${cat.type}"]`);
    if (radio) radio.checked = true;
    setIconPicker('category-icon-picker', cat.icon || 'box');
  } else {
    titleEl.textContent = 'เพิ่มหมวดหมู่';
    deleteBtn.classList.add('hidden');
    idInput.value = '';
    document.getElementById('category-name').value = '';
    document.querySelector('input[name="cat-type"][value="expense"]').checked = true;
    setIconPicker('category-icon-picker', 'box');
  }
  openModal('category-modal');
};

document.getElementById('category-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = document.getElementById('category-id').value;
  const data = {
    name: document.getElementById('category-name').value.trim(),
    type: document.querySelector('input[name="cat-type"]:checked')?.value || 'expense',
    icon: getSelectedIcon('category-icon-picker', 'box'),
  };

  if (editId) {
    const existing = await store.get('categories', editId);
    Object.assign(existing, data, { updatedAt: new Date().toISOString(), synced: true });
    await store.put('categories', existing);
    await store.addToPendingQueue({ id: editId, store: 'categories', op: 'update' });
    syncCategory(existing).catch(console.error);
  } else {
    const cat = makeCategory(data);
    cat.synced = true;
    await store.put('categories', cat);
    await store.addToPendingQueue({ id: cat.id, store: 'categories', op: 'create' });
    syncCategory(cat).catch(console.error);
  }
  updateSyncWidget('synced');

  closeModal('category-modal');
  showToast(editId ? 'แก้ไขหมวดหมู่แล้ว' : 'เพิ่มหมวดหมู่แล้ว');
  refreshPage();
});

document.getElementById('btn-delete-category')?.addEventListener('click', async () => {
  const editId = document.getElementById('category-id').value;
  const ok = await showConfirm('ลบหมวดหมู่', 'ต้องการลบหมวดหมู่นี้หรือไม่?');
  if (!ok) return;
  await store.softDelete('categories', editId);
  await store.addToPendingQueue({ id: editId, store: 'categories', op: 'delete' });
  deleteSupabaseCategory(editId).catch(console.error);
  updateSyncWidget('synced');
  closeModal('category-modal');
  showToast('ลบหมวดหมู่แล้ว');
  refreshPage();
});


// ── Budget modal ──────────────────────────────────────────────

window.openBudgetModal = async function(budgetId = null, defaultMonth = null, prefillCategoryId = null) {
  const titleEl    = document.getElementById('budget-modal-title');
  const idInput    = document.getElementById('budget-id');
  const deleteBtn  = document.getElementById('btn-delete-budget');
  const noMonthCb  = document.getElementById('budget-no-month');
  const monthGrp   = document.getElementById('grp-budget-month');
  const cats       = await store.getCategories('expense');

  const catSel = document.getElementById('budget-category');
  catSel.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  const toggleMonthField = () => {
    const noMonth = noMonthCb.checked;
    monthGrp.classList.toggle('hidden', noMonth);
    document.getElementById('budget-month').required = !noMonth;
  };

  noMonthCb.removeEventListener('change', toggleMonthField);
  noMonthCb.addEventListener('change', toggleMonthField);

  if (budgetId) {
    const b = await store.get('budgets', budgetId);
    if (!b) return;
    titleEl.textContent = 'แก้ไขงบประมาณ';
    idInput.value = b.id;
    catSel.value = b.categoryId;
    const isTemplate = b.month == null;
    noMonthCb.checked = isTemplate;
    if (!isTemplate) document.getElementById('budget-month').value = b.month;
    document.getElementById('budget-limit').value = (b.limitMinor / 100).toFixed(2);
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'ตั้งงบประมาณ';
    idInput.value = '';
    if (prefillCategoryId && cats.some(c => c.id === prefillCategoryId)) {
      catSel.value = prefillCategoryId;
    }
    noMonthCb.checked = false;
    document.getElementById('budget-month').value = defaultMonth || currentMonth();
    document.getElementById('budget-limit').value = '';
    deleteBtn.classList.add('hidden');
  }
  toggleMonthField();
  openModal('budget-modal');
};

document.getElementById('btn-delete-budget')?.addEventListener('click', async () => {
  const editId = document.getElementById('budget-id').value;
  if (!editId) return;
  const ok = await showConfirm('ลบงบประมาณ', 'ต้องการลบงบประมาณหมวดนี้หรือไม่?');
  if (!ok) return;
  await store.softDelete('budgets', editId);
  await store.addToPendingQueue({ id: editId, store: 'budgets', op: 'delete' });
  deleteSupabaseBudget(editId).catch(console.error);
  updateSyncWidget('synced');
  closeModal('budget-modal');
  showToast('ลบงบประมาณแล้ว');
  refreshPage();
});

document.getElementById('budget-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId    = document.getElementById('budget-id').value;
  const noMonth   = document.getElementById('budget-no-month').checked;
  const monthVal  = noMonth ? null : document.getElementById('budget-month').value;

  if (!noMonth && !monthVal) {
    showToast('กรุณาระบุเดือน หรือเลือก "ใช้เป็นงบมาตรฐานทุกเดือน"', 'error');
    return;
  }

  const data = {
    categoryId: document.getElementById('budget-category').value,
    month:      monthVal,
    limitMinor: parseAmount(document.getElementById('budget-limit').value),
  };

  if (editId) {
    const existing = await store.get('budgets', editId);
    Object.assign(existing, data, { updatedAt: new Date().toISOString(), synced: true });
    await store.put('budgets', existing);
    await store.addToPendingQueue({ id: editId, store: 'budgets', op: 'update' });
    syncBudget(existing).catch(console.error);
  } else {
    const allBudgets = await store.getAll('budgets');
    const duplicate = allBudgets.find(b => !b.deletedAt && b.categoryId === data.categoryId && b.month === data.month);
    if (duplicate) {
      Object.assign(duplicate, data, { updatedAt: new Date().toISOString(), synced: true });
      await store.put('budgets', duplicate);
      await store.addToPendingQueue({ id: duplicate.id, store: 'budgets', op: 'update' });
      syncBudget(duplicate).catch(console.error);
    } else {
      const bgt = makeBudget(data);
      bgt.synced = true;
      await store.put('budgets', bgt);
      await store.addToPendingQueue({ id: bgt.id, store: 'budgets', op: 'create' });
      syncBudget(bgt).catch(console.error);
    }
  }
  updateSyncWidget('synced');

  closeModal('budget-modal');
  showToast(editId ? 'แก้ไขงบประมาณแล้ว' : 'ตั้งงบประมาณแล้ว');
  refreshPage();
});


// ── Subscription modal ────────────────────────────────────────

window.openSubscriptionModal = async function(subId = null) {
  const titleEl   = document.getElementById('subscription-modal-title');
  const idInput   = document.getElementById('sub-id');
  const deleteBtn = document.getElementById('btn-delete-sub');

  const [accounts, categories] = await Promise.all([
    store.getAccounts(),
    store.getCategories('expense'),
  ]);

  document.getElementById('sub-account').innerHTML =
    accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  document.getElementById('sub-category').innerHTML =
    categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  if (subId) {
    const all = getSubscriptions();
    const sub = all.find(s => s.id === subId);
    if (!sub) return;
    titleEl.textContent = 'แก้ไขรายจ่ายประจำ';
    idInput.value = sub.id;
    document.getElementById('sub-name').value = sub.name || '';
    document.getElementById('sub-amount').value = (sub.amountMinor / 100).toFixed(2);
    document.getElementById('sub-due-day').value = sub.dueDay || 1;
    document.getElementById('sub-account').value = sub.accountId;
    document.getElementById('sub-category').value = sub.categoryId;
    document.getElementById('sub-note').value = sub.note || '';
    setIconPicker('sub-icon-picker', sub.icon || 'tv');
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'เพิ่มรายจ่ายประจำ';
    idInput.value = '';
    document.getElementById('sub-name').value = '';
    document.getElementById('sub-amount').value = '';
    document.getElementById('sub-due-day').value = new Date().getDate();
    document.getElementById('sub-note').value = '';
    setIconPicker('sub-icon-picker', 'tv');
    deleteBtn.classList.add('hidden');
  }

  openModal('subscription-modal');
};

document.getElementById('subscription-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = document.getElementById('sub-id').value;
  const name = document.getElementById('sub-name').value.trim();
  const amountMinor = parseAmount(document.getElementById('sub-amount').value);
  const dueDay = parseInt(document.getElementById('sub-due-day').value, 10) || 1;
  const accountId = document.getElementById('sub-account').value;
  const categoryId = document.getElementById('sub-category').value;
  const note = document.getElementById('sub-note').value.trim();
  const icon = getSelectedIcon('sub-icon-picker', 'tv');

  if (!name) {
    showToast('กรุณาระบุชื่อรายการ', 'error');
    return;
  }
  if (!amountMinor || amountMinor <= 0) {
    showToast('กรุณาระบุจำนวนเงิน', 'error');
    return;
  }

  saveSubscription({
    id: editId || undefined,
    name,
    amountMinor,
    dueDay,
    accountId,
    categoryId,
    note,
    icon,
    cycle: 'monthly',
  });

  closeModal('subscription-modal');
  showToast(editId ? 'แก้ไขรายจ่ายประจำแล้ว' : 'เพิ่มรายจ่ายประจำแล้ว');
  refreshPage();
});

document.getElementById('btn-delete-sub')?.addEventListener('click', async () => {
  const editId = document.getElementById('sub-id').value;
  if (!editId) return;
  const ok = await showConfirm('ลบรายการ', 'ต้องการลบรายจ่ายประจำนี้หรือไม่?');
  if (!ok) return;

  deleteSubscription(editId);
  closeModal('subscription-modal');
  showToast('ลบรายการแล้ว');
  refreshPage();
});

window.paySubscription = async (subId) => {
  await paySubscription(subId, store);
  refreshPage();
};

// ── Group Pool & Member Ledger Modal Wiring ──────────────────

let currentTopUpCallback = null;

function renderPoolMemberInputRow(m = {}) {
  const div = document.createElement('div');
  div.className = 'pool-member-edit-row';
  div.innerHTML = `
    <input type="hidden" class="pmem-id" value="${m.id || ''}" />
    <input type="text" class="pmem-name" placeholder="ชื่อเพื่อน" value="${m.name || ''}" style="flex:1.2;min-width:0" required />
    <input type="number" class="pmem-share mono-input" placeholder="ยอดหาร (฿)" value="${m.shareAmountMinor ? (m.shareAmountMinor / 100).toFixed(0) : ''}" style="flex:1;min-width:0" step="any" min="0" required />
    <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;white-space:nowrap">
      <input type="checkbox" class="pmem-self" ${m.isSelf ? 'checked' : ''} /> เรา
    </label>
    <button type="button" class="icon-btn btn-remove-pmem" title="ลบ" style="padding:4px">
      ${renderIcon('x', 14)}
    </button>
  `;
  div.querySelector('.btn-remove-pmem').addEventListener('click', () => {
    div.remove();
  });
  return div;
}

window.openGroupPoolModal = async (poolId = null) => {
  const accounts = await store.getAccounts();
  const poolAccSelect = document.getElementById('pool-account');
  poolAccSelect.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  const titleEl = document.getElementById('group-pool-modal-title');
  const idInput = document.getElementById('pool-id');
  const deleteBtn = document.getElementById('btn-delete-pool');
  const container = document.getElementById('pool-members-container');
  container.innerHTML = '';

  if (poolId) {
    const pools = getGroupPools();
    const pool = pools.find(p => p.id === poolId);
    if (!pool) return;

    titleEl.textContent = 'แก้ไขตี้หารบิล';
    idInput.value = pool.id;
    document.getElementById('pool-name').value = pool.name || '';
    document.getElementById('pool-amount').value = (pool.amountMinor / 100).toFixed(2);
    document.getElementById('pool-due-day').value = pool.dueDay || 1;
    document.getElementById('pool-account').value = pool.accountId || '';
    document.getElementById('pool-note').value = pool.note || '';
    setIconPicker('pool-icon-picker', pool.icon || 'users');
    deleteBtn.classList.remove('hidden');

    if (pool.members && pool.members.length > 0) {
      pool.members.forEach(m => container.appendChild(renderPoolMemberInputRow(m)));
    } else {
      container.appendChild(renderPoolMemberInputRow({ name: 'เรา', isSelf: true }));
      container.appendChild(renderPoolMemberInputRow({ name: '', isSelf: false }));
    }
  } else {
    titleEl.textContent = 'สร้างตี้หารบิลใหม่';
    idInput.value = '';
    document.getElementById('pool-name').value = '';
    document.getElementById('pool-amount').value = '';
    document.getElementById('pool-due-day').value = new Date().getDate();
    document.getElementById('pool-note').value = '';
    setIconPicker('pool-icon-picker', 'users');
    deleteBtn.classList.add('hidden');

    container.appendChild(renderPoolMemberInputRow({ name: 'เรา', isSelf: true }));
    container.appendChild(renderPoolMemberInputRow({ name: '', isSelf: false }));
  }

  openModal('group-pool-modal');
};

document.getElementById('btn-add-pool-member')?.addEventListener('click', () => {
  const container = document.getElementById('pool-members-container');
  container.appendChild(renderPoolMemberInputRow({ name: '', isSelf: false }));
});

document.getElementById('group-pool-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = document.getElementById('pool-id').value;
  const name = document.getElementById('pool-name').value.trim();
  const amountMinor = parseAmount(document.getElementById('pool-amount').value);
  const dueDay = parseInt(document.getElementById('pool-due-day').value, 10) || 1;
  const accountId = document.getElementById('pool-account').value;
  const note = document.getElementById('pool-note').value.trim();
  const icon = getSelectedIcon('pool-icon-picker', 'users');

  if (!name) {
    showToast('กรุณาระบุชื่อตี้', 'error');
    return;
  }
  if (!amountMinor || amountMinor <= 0) {
    showToast('กรุณาระบุยอดบิลรวม', 'error');
    return;
  }

  // Parse members from container
  const memberRows = document.querySelectorAll('#pool-members-container .pool-member-edit-row');
  const existingPool = editId ? getGroupPools().find(p => p.id === editId) : null;
  const existingMembersMap = existingPool ? Object.fromEntries(existingPool.members.map(m => [m.id, m])) : {};

  const members = [];
  memberRows.forEach(row => {
    const id = row.querySelector('.pmem-id').value || genId('pmem');
    const mName = row.querySelector('.pmem-name').value.trim();
    const shareMinor = parseAmount(row.querySelector('.pmem-share').value) || 0;
    const isSelf = row.querySelector('.pmem-self').checked;

    if (!mName) return;

    const old = existingMembersMap[id];
    members.push(makePoolMember({
      id,
      name: mName,
      isSelf,
      shareAmountMinor: shareMinor,
      balanceMinor: old ? old.balanceMinor : 0,
    }));
  });

  if (members.length === 0) {
    showToast('กรุณาระบุสมาชิกอย่างน้อย 1 คน', 'error');
    return;
  }

  const pool = makeGroupPool({
    id: editId || undefined,
    name,
    icon,
    accountId,
    amountMinor,
    dueDay,
    cycle: 'monthly',
    note,
    members,
    lastCycleMonth: existingPool?.lastCycleMonth || '',
  });

  saveGroupPool(pool);
  closeModal('group-pool-modal');
  showToast(editId ? 'แก้ไขตี้หารบิลแล้ว' : 'สร้างตี้หารบิลเรียบร้อยแล้ว');
  refreshPage();
});

document.getElementById('btn-delete-pool')?.addEventListener('click', async () => {
  const editId = document.getElementById('pool-id').value;
  if (!editId) return;
  const ok = await showConfirm('ลบตี้หารบิล', 'ต้องการลบตี้หารบิลนี้หรือไม่? (ประวัติการเงินที่บันทึกไปแล้วจะไม่ถูกลบ)');
  if (!ok) return;

  deleteGroupPool(editId);
  closeModal('group-pool-modal');
  showToast('ลบตี้หารบิลแล้ว');
  refreshPage();
});

window.openPoolTopUpModal = (poolId, memberId, onSuccess = null) => {
  const pools = getGroupPools();
  const pool = pools.find(p => p.id === poolId);
  if (!pool) return;
  const member = pool.members.find(m => m.id === memberId);
  if (!member) return;

  currentTopUpCallback = onSuccess;
  document.getElementById('topup-pool-id').value = pool.id;
  document.getElementById('topup-member-id').value = member.id;
  document.getElementById('topup-amount').value = '';
  document.getElementById('topup-date').value = todayStr();
  document.getElementById('topup-note').value = '';

  const badge = document.getElementById('topup-info-badge');
  badge.innerHTML = `
    สมาชิก: <span style="color:var(--primary);font-weight:700">${member.name}</span> · ตี้: ${pool.name}<br>
    ยอดคงเหลือปัจจุบัน: <span class="mono">${formatTHB(member.balanceMinor)}</span>
  `;

  openModal('pool-topup-modal');
};

document.getElementById('pool-topup-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const poolId = document.getElementById('topup-pool-id').value;
  const memberId = document.getElementById('topup-member-id').value;
  const amountMinor = parseAmount(document.getElementById('topup-amount').value);
  const date = document.getElementById('topup-date').value || todayStr();
  const note = document.getElementById('topup-note').value.trim();

  if (!amountMinor || amountMinor <= 0) {
    showToast('กรุณาระบุจำนวนเงินที่ถูกต้อง', 'error');
    return;
  }

  try {
    const { member } = await topUpMember({
      poolId,
      memberId,
      amountMinor,
      date,
      note,
      store,
    });

    closeModal('pool-topup-modal');
    showToast(`บันทึกยอดเงินเข้าของ ${member.name} จำนวน ${formatTHB(amountMinor)} เรียบร้อย`);
    if (typeof currentTopUpCallback === 'function') {
      currentTopUpCallback();
    } else {
      refreshPage();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Settings page (Zero-Emoji Minimalist UI) ─────────────────

async function initSettings(container) {
  const supaCfg = getSupabaseConfig();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ตั้งค่า</h1>
    </div>
    <div class="page-body">
      <!-- Theme & Appearance Card -->
      <div class="card" style="max-width:520px">
        <h3 class="card-title">ธีม & การแสดงผล</h3>
        <div class="toggle-row" style="margin-top:8px">
          <span class="toggle-label">โหมดมืด (Dark Mode)</span>
          <label class="toggle-switch">
            <input type="checkbox" id="s-dark-mode" ${localStorage.getItem(DARK_KEY) === '1' ? 'checked' : ''}>
            <span class="toggle-knob"></span>
          </label>
        </div>
        <div style="margin-top:14px;font-size:12px;color:var(--text-muted);margin-bottom:8px">สีหลักของระบบ</div>
        <div class="theme-picker" id="s-theme-picker">
          ${THEMES.map(t => `
            <button type="button" class="theme-swatch ${(localStorage.getItem(THEME_KEY) || 'mono') === t.id ? 'selected' : ''}" data-theme-id="${t.id}" style="background:${t.color}" title="${t.name}">
              <span class="theme-check">✓</span>
            </button>
          `).join('')}
        </div>
        <div style="margin-top:16px;font-size:12px;color:var(--text-muted);margin-bottom:8px">แบบอักษร (Font)</div>
        <div class="font-picker" id="s-font-picker">
          ${FONTS.map(f => `
            <button type="button" class="font-option ${(localStorage.getItem(FONT_KEY) || 'dm-sans') === f.id ? 'selected' : ''}" data-font-id="${f.id}" style="font-family:${f.css}">
              <span class="font-option-sample">${f.sample}</span>
              <span class="font-option-check">✓</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- AI Slip Scanner (Gemini Vision) -->
      <div class="card" style="max-width:520px;margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h3 class="card-title" style="margin:0">AI สแกนสลิป (Gemini Vision)</h3>
          <span class="badge ${getGeminiKey() ? 'badge-income' : 'badge-neutral'}">
            ${getGeminiKey() ? 'พร้อมใช้งาน' : 'ยังไม่ตั้งค่า'}
          </span>
        </div>
        <p style="margin-top:6px;font-size:12px;color:var(--text-muted)">
          อ่านยอดเงิน วันที่ และบันทึกช่วยจำจากสลิปธนาคารอัตโนมัติ (ฟรีผ่าน Google AI Studio)
        </p>
        <form id="gemini-key-form" autocomplete="off" style="margin-top:10px">
          <div class="field">
            <label>Gemini API Key</label>
            <input type="password" id="s-gemini-key" value="${getGeminiKey()}" placeholder="AIzaSy..." />
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
            <button type="submit" class="btn-primary btn-sm">บันทึก Key</button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="btn-ghost btn-sm" style="text-decoration:none">
              รับ API Key ฟรี ↗
            </a>
          </div>
        </form>
      </div>

      <!-- Supabase Cloud Sync Card -->
      <div class="card" style="max-width:520px;margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h3 class="card-title" style="margin:0">Supabase Cloud Sync</h3>
          <span class="badge badge-income">Auto-Sync</span>
        </div>
        <p style="margin-top:6px;font-size:12px;color:var(--text-muted)">
          ซิงค์ข้อมูลข้ามอุปกรณ์แบบเรียลไทม์บน PostgreSQL
        </p>
        <form id="supabase-form" autocomplete="off" style="margin-top:10px">
          <div class="field">
            <label>Project URL</label>
            <input type="text" id="s-supabase-url" value="${supaCfg.url}" placeholder="https://xxxx.supabase.co" />
          </div>
          <div class="field">
            <label>Publishable / Anon Key</label>
            <input type="password" id="s-supabase-key" value="${supaCfg.key}" placeholder="sb_publishable_..." />
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button type="submit" class="btn-primary btn-sm">บันทึกการตั้งค่า</button>
            <button type="button" id="s-supabase-test" class="btn-ghost btn-sm">ทดสอบการเชื่อมต่อ</button>
          </div>
          <div id="s-supabase-result" style="margin-top:10px;font-size:13px"></div>
        </form>

        <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">จัดการข้อมูล Cloud</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn-ghost btn-sm" id="s-migrate-supabase">
              ${renderIcon('upload', 14)} ส่งข้อมูลในเครื่องขึ้น Cloud
            </button>
            <button type="button" class="btn-ghost btn-sm" id="s-pull-supabase">
              ${renderIcon('download', 14)} ดึงข้อมูลล่าสุดจาก Cloud
            </button>
          </div>
          <div id="s-migrate-result" style="margin-top:8px;font-size:12px"></div>
        </div>
      </div>

      <!-- Complete JSON Vault Backup & Restore + Excel Export -->
      <div class="card" style="max-width:520px;margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h3 class="card-title" style="margin:0">สำรองและส่งออกข้อมูล</h3>
          <span class="badge badge-neutral">JSON & Excel</span>
        </div>
        <p style="margin-top:6px;font-size:12px;color:var(--text-muted)">
          สำรองข้อมูลทั้งหมด (บัญชี, หมวดหมู่, งบประมาณ, รายการ, บิลประจำ และ Habit Engine) หรือส่งออกเป็นไฟล์ Excel
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button type="button" class="btn-primary btn-sm" id="s-backup-json">
            ${renderIcon('download', 14)} สำรองข้อมูล (.json)
          </button>
          <button type="button" class="btn-ghost btn-sm" id="s-restore-json">
            ${renderIcon('upload', 14)} กู้คืนจากไฟล์ (.json)
          </button>
          <button type="button" class="btn-ghost btn-sm" id="s-export-all">
            Export Excel (.xlsx)
          </button>
          <input type="file" id="s-restore-input" accept=".json,application/json" class="hidden" />
        </div>
        <div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn-ghost btn-sm" id="s-pull-all">ดึงข้อมูลจาก GitHub</button>
          <button type="button" class="btn-danger btn-sm" id="s-clear-cache">ล้างข้อมูลในเครื่อง</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('supabase-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('s-supabase-url').value.trim();
    const key = document.getElementById('s-supabase-key').value.trim();
    saveSupabaseConfig(url, key);
    showToast('บันทึกการตั้งค่า Supabase แล้ว');
  });

  document.getElementById('s-supabase-test')?.addEventListener('click', async () => {
    const resEl = document.getElementById('s-supabase-result');
    resEl.textContent = 'กำลังทดสอบเชื่อมต่อ...';
    resEl.style.color = 'var(--text-secondary)';
    const r = await testSupabaseConnection();
    if (r.ok) {
      resEl.textContent = 'เชื่อมต่อกับ Supabase สำเร็จ พร้อมใช้งาน';
      resEl.style.color = 'var(--income)';
    } else {
      resEl.textContent = `เชื่อมต่อไม่สำเร็จ: ${r.error || 'HTTP ' + r.status}`;
      resEl.style.color = 'var(--expense)';
    }
  });

  document.getElementById('s-migrate-supabase')?.addEventListener('click', async () => {
    const ok = await showConfirm(
      'ส่งข้อมูลขึ้น Supabase',
      'ระบบจะส่งบัญชี หมวดหมู่ งบประมาณ และรายการทั้งหมดในเครื่องขึ้นไปเก็บบน Supabase ต้องการดำเนินการหรือไม่?'
    );
    if (!ok) return;
    const resEl = document.getElementById('s-migrate-result');
    resEl.textContent = 'กำลังส่งข้อมูลขึ้น Supabase...';
    resEl.style.color = 'var(--text-secondary)';
    try {
      const stats = await migrateAllToSupabase(store);
      resEl.textContent = `ส่งข้อมูลสำเร็จ: ${stats.accounts} บัญชี, ${stats.categories} หมวดหมู่, ${stats.budgets} งบประมาณ, ${stats.transactions} รายการ`;
      resEl.style.color = 'var(--income)';
      showToast('ส่งข้อมูลขึ้น Supabase สำเร็จ');
      updateSyncWidget('synced');
    } catch (err) {
      resEl.textContent = `ล้มเหลว: ${err.message}`;
      resEl.style.color = 'var(--expense)';
      showToast('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + err.message, 'error');
    }
  });

  document.getElementById('s-pull-supabase')?.addEventListener('click', async () => {
    updateSyncWidget('syncing');
    const result = await pullAllFromSupabase(store);
    if (result.ok) {
      updateSyncWidget('synced');
      showToast(`ดึงข้อมูลจาก Supabase สำเร็จ (${result.count} รายการ)`);
      navigate(currentPage);
    } else {
      updateSyncWidget('error');
      showToast('ดึงข้อมูลไม่สำเร็จ: ' + result.error, 'error');
    }
  });

  document.getElementById('gemini-key-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = document.getElementById('s-gemini-key').value.trim();
    saveGeminiKey(val);
    showToast(val ? 'บันทึก Gemini API Key แล้ว' : 'ลบ Gemini API Key แล้ว');
    initSettings(container);
  });

  document.getElementById('s-dark-mode')?.addEventListener('change', (e) => {
    applyDarkMode(e.target.checked);
  });

  document.getElementById('s-theme-picker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-id]');
    if (!btn) return;
    const themeId = btn.dataset.themeId;
    applyTheme(themeId);
    document.querySelectorAll('#s-theme-picker .theme-swatch').forEach(el => {
      el.classList.toggle('selected', el.dataset.themeId === themeId);
    });
  });

  document.getElementById('s-font-picker')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-font-id]');
    if (!btn) return;
    const fontId = btn.dataset.fontId;
    applyFont(fontId);
    document.querySelectorAll('#s-font-picker .font-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.fontId === fontId);
    });
  });

  document.getElementById('s-pull-all')?.addEventListener('click', async () => {
    const ok = await showConfirm('ดึงข้อมูลจาก GitHub', 'ข้อมูลใน GitHub จะถูกดึงลงมาและรวมกับข้อมูลในเครื่อง ดำเนินการต่อ?');
    if (!ok) return;
    updateSyncWidget('syncing');
    const result = await syncer.pullAll(store);
    if (result.ok) {
      updateSyncWidget('synced');
      showToast('ดึงข้อมูลสำเร็จ');
      navigate(currentPage);
    } else {
      updateSyncWidget('error');
      showToast('ดึงข้อมูลไม่สำเร็จ: ' + result.error, 'error');
    }
  });

  document.getElementById('s-backup-json')?.addEventListener('click', async () => {
    try {
      const meta = await exportFullJsonBackup(store);
      showToast(`ดาวน์โหลดไฟล์สำรองเรียบร้อย (${meta.counts.transactions} รายการ)`);
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการสำรองข้อมูล: ' + err.message, 'error');
    }
  });

  const restoreInput = document.getElementById('s-restore-input');
  document.getElementById('s-restore-json')?.addEventListener('click', () => {
    restoreInput?.click();
  });

  restoreInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await showConfirm(
      'ยืนยันการกู้คืนข้อมูล',
      `คุณต้องการกู้คืนข้อมูลจากไฟล์ "${file.name}" หรือไม่? ข้อมูลจะถูกนำเข้าและบันทึกลงในเครื่องทันที`
    );
    if (!ok) {
      restoreInput.value = '';
      return;
    }
    try {
      const text = await file.text();
      const res = await importFullJsonBackup(text, store);
      showToast(`กู้คืนข้อมูลสำเร็จ (${res.txCount} รายการ, ${res.accCount} บัญชี)`);
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      showToast('กู้คืนข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      restoreInput.value = '';
    }
  });

  document.getElementById('s-export-all')?.addEventListener('click', async () => {
    const [txs, activeAccs, archivedAccs, cats, budgets] = await Promise.all([
      store.getTransactions({}),
      store.getAccounts(),
      store.getArchivedAccounts(),
      store.getCategories(),
      store.getAll('budgets'),
    ]);
    exportTransactions(txs, [...activeAccs, ...archivedAccs], cats, budgets, 'finance-tracker-export');
  });

  document.getElementById('s-clear-cache')?.addEventListener('click', async () => {
    const ok = await showConfirm('ล้างข้อมูล', 'ข้อมูลทั้งหมดในเครื่องจะถูกลบ ดำเนินการต่อ?');
    if (!ok) return;
    const dbs = await indexedDB.databases?.() || [];
    for (const db of dbs) {
      if (db.name === 'finance_tracker_v2') indexedDB.deleteDatabase(db.name);
    }
    showToast('ล้างข้อมูลแล้ว กำลังโหลดใหม่...');
    setTimeout(() => location.reload(), 1000);
  });
}

// ── SVG Icon Pickers ──────────────────────────────────────────

function renderIconPicker(pickerId, iconKeys) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  picker.innerHTML = iconKeys.map((key, idx) => `
    <button type="button" class="icon-opt ${idx === 0 ? 'selected' : ''}" data-icon="${key}" title="${key}">
      ${renderIcon(key, 18)}
    </button>
  `).join('');
}

function initAllIconPickers() {
  renderIconPicker('account-icon-picker', ACCOUNT_ICON_KEYS);
  renderIconPicker('category-icon-picker', CATEGORY_ICON_KEYS);
  renderIconPicker('sub-icon-picker', SUB_ICON_KEYS);
}

document.addEventListener('click', (e) => {
  const opt = e.target.closest('.icon-opt');
  if (!opt) return;
  const picker = opt.closest('.icon-picker');
  if (!picker) return;
  picker.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
});

function setIconPicker(pickerId, iconOrEmoji) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  const normalized = normalizeIconKey(iconOrEmoji, picker.querySelector('.icon-opt')?.dataset.icon || 'box');
  let matched = false;
  picker.querySelectorAll('.icon-opt').forEach(o => {
    const isMatch = o.dataset.icon === normalized;
    o.classList.toggle('selected', isMatch);
    if (isMatch) matched = true;
  });
  if (!matched) {
    const first = picker.querySelector('.icon-opt');
    if (first) first.classList.add('selected');
  }
}

function getSelectedIcon(pickerId, fallback = 'box') {
  const picker = document.getElementById(pickerId);
  return picker?.querySelector('.icon-opt.selected')?.dataset.icon || fallback;
}

// ── Modal helpers ─────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  document.body.style.overflow = '';
  if (id === 'slip-modal') {
    revokeCurrentThumb();
    isProcessingSlip = false;
    document.getElementById('slip-lightbox')?.classList.add('hidden');
  }
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
    document.body.style.overflow = '';
    if (e.target.id === 'slip-modal') {
      revokeCurrentThumb();
      isProcessingSlip = false;
      document.getElementById('slip-lightbox')?.classList.add('hidden');
    }
    return;
  }
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) {
    closeModal(closeBtn.dataset.close);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lightbox = document.getElementById('slip-lightbox');
    if (lightbox && !lightbox.classList.contains('hidden')) {
      lightbox.classList.add('hidden');
      return;
    }
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
      m.classList.add('hidden');
      if (m.id === 'slip-modal') {
        revokeCurrentThumb();
        isProcessingSlip = false;
      }
    });
    document.body.style.overflow = '';
  }
});

// ── Confirm dialog ────────────────────────────────────────────

function showConfirm(title, message) {
  return new Promise((resolve) => {
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    openModal('confirm-modal');

    pendingConfirm = resolve;
  });
}

document.getElementById('confirm-ok')?.addEventListener('click', () => {
  closeModal('confirm-modal');
  if (pendingConfirm) { pendingConfirm(true); pendingConfirm = null; }
});

document.getElementById('confirm-cancel')?.addEventListener('click', () => {
  closeModal('confirm-modal');
  if (pendingConfirm) { pendingConfirm(false); pendingConfirm = null; }
});

// ── Toast ─────────────────────────────────────────────────────

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// ── Calculator ────────────────────────────────────────────────

let _calcTarget = null;
let _calcExpr   = '';

function calcEval(expr) {
  if (!expr || typeof expr !== 'string') return 0;
  const cleaned = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (!/^[\d+\-*/.()]+$/.test(cleaned)) return null;

  try {
    const tokens = cleaned.match(/(\d+(\.\d+)?|[+\-*/()])/g);
    if (!tokens) return null;

    let pos = 0;
    function parsePrimary() {
      const token = tokens[pos];
      if (token === '(') {
        pos++;
        const val = parseAddSub();
        if (tokens[pos] === ')') pos++;
        return val;
      }
      if (token === '-') {
        pos++;
        return -parsePrimary();
      }
      if (token === '+') {
        pos++;
        return parsePrimary();
      }
      pos++;
      const num = parseFloat(token);
      return isNaN(num) ? 0 : num;
    }

    function parseMulDiv() {
      let left = parsePrimary();
      while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
        const op = tokens[pos++];
        const right = parsePrimary();
        if (op === '*') left = left * right;
        else if (op === '/') left = right === 0 ? 0 : left / right;
      }
      return left;
    }

    function parseAddSub() {
      let left = parseMulDiv();
      while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
        const op = tokens[pos++];
        const right = parseMulDiv();
        if (op === '+') left = left + right;
        else if (op === '-') left = left - right;
      }
      return left;
    }

    const result = parseAddSub();
    return isFinite(result) ? Math.round(result * 1e8) / 1e8 : null;
  } catch { return null; }
}

function showCalc(inputEl) {
  _calcTarget = inputEl;
  const raw = String(inputEl.value || '').replace(/[^0-9.]/g, '');
  _calcExpr = raw;
  document.getElementById('calc-label').textContent =
    inputEl.dataset.label || 'จำนวน';
  document.getElementById('calc-display').textContent = _calcExpr || '0';
  document.getElementById('calc-overlay').classList.remove('hidden');
}

function hideCalc() {
  document.getElementById('calc-overlay').classList.add('hidden');
  _calcTarget = null;
}

document.getElementById('calc-overlay')?.addEventListener('pointerdown', e => {
  if (e.target === document.getElementById('calc-overlay')) { hideCalc(); return; }

  const btn = e.target.closest('[data-calc]');
  if (!btn) return;
  e.preventDefault();

  const key = btn.dataset.calc;
  const display = document.getElementById('calc-display');

  if (key === '⌫') {
    _calcExpr = _calcExpr.slice(0, -1);
  } else if (key === '✓') {
    const result = calcEval(_calcExpr);
    if (_calcTarget !== null) {
      const val = result !== null ? result : (parseFloat(_calcExpr) || 0);
      _calcTarget.value = val;
      _calcTarget.dispatchEvent(new Event('input',  { bubbles: true }));
      _calcTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hideCalc();
    return;
  } else {
    const ops = ['+', '-', '×'];
    if (ops.includes(key) && ops.includes(_calcExpr.slice(-1))) {
      _calcExpr = _calcExpr.slice(0, -1) + key;
    } else {
      _calcExpr += key;
    }
  }

  display.textContent = _calcExpr || '0';
});

document.addEventListener('focusin', e => {
  const input = e.target;
  if (input.tagName === 'INPUT' && 'calculator' in input.dataset) {
    input.blur();
    showCalc(input);
  }
}, true);

export { openTxModal };

// ── Start ─────────────────────────────────────────────────────

boot().catch(err => {
  console.error('Boot failed:', err);
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#DC2626">
    <strong>เกิดข้อผิดพลาด:</strong> ${err.message}<br/>
    <small>กรุณา reload หน้าและลองใหม่</small>
  </div>`;
});
