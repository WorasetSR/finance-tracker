// ─────────────────────────────────────────────────────────────
//  app.js — entry point, router, shared modal management
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { LocalStore }                    from './local-store.js';
import { getConfig, saveConfig, isConfigured, getSyncState, getLastSync, getGeminiKey, saveGeminiKey } from './settings.js';
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
import { getSubscriptions, saveSubscription, deleteSubscription, paySubscription, getUpcomingBills } from './subscriptions.js';
import { exportTransactions }            from './export.js';
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
  { id: 'dm-sans', name: 'DM Sans',  sample: 'DM Sans — สวยงาม',   css: "'DM Sans', system-ui, sans-serif",  url: null },
  { id: 'sarabun', name: 'Sarabun',  sample: 'Sarabun — อ่านง่าย', css: "'Sarabun', system-ui, sans-serif",  url: 'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600&display=swap' },
  { id: 'prompt',  name: 'Prompt',   sample: 'Prompt — กลมนุ่ม',   css: "'Prompt', system-ui, sans-serif",   url: 'https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600&display=swap' },
  { id: 'inter',   name: 'Inter',    sample: 'Inter — เป็นทางการ', css: "'Inter', system-ui, sans-serif",    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap' },
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

// Apply saved font on boot
applyFont(localStorage.getItem(FONT_KEY) || 'dm-sans');

// ── Theme picker ──────────────────────────────────────────────

const THEMES = [
  { id:'mono',   name:'Mono',   color:'#18181B', light:'#3F3F46', p600:'#09090B', p700:'#09090B', p50:'#FAFAFA', p100:'#F4F4F5', p50dk:'#1a1a1f', shadow:'rgba(0,0,0,0.35)'   },
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
  r.setProperty('--primary',        theme.color);
  r.setProperty('--primary-light',  theme.light);
  r.setProperty('--primary-600',    theme.p600);
  r.setProperty('--primary-700',    theme.p700);
  r.setProperty('--primary-50',     isDark ? theme.p50dk : theme.p50);
  r.setProperty('--primary-100',    theme.p100);
  r.setProperty('--primary-shadow', theme.shadow);
  localStorage.setItem(THEME_KEY, theme.id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.color);
}

function applyDarkMode(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem(DARK_KEY, isDark ? '1' : '0');
  applyTheme(localStorage.getItem(THEME_KEY) || 'teal');
}

// Apply on boot — dark mode first so applyTheme reads correct data-theme
const _bootDark = localStorage.getItem(DARK_KEY) === '1';
document.documentElement.setAttribute('data-theme', _bootDark ? 'dark' : 'light');
applyTheme(localStorage.getItem(THEME_KEY) || 'mono');

let currentPage    = 'dashboard';
let pageCleanup    = null;   // cleanup fn returned by page init
let pendingConfirm = null;   // resolve fn for confirm modal

// ── Boot ──────────────────────────────────────────────────────

async function boot() {
  await store.init();

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
  dashboard:    'Dashboard',
  transactions: 'รายการ',
  budget:       'งบประมาณ',
  analytics:    'วิเคราะห์',
  accounts:     'บัญชี & หมวด',
  settings:     'ตั้งค่า',
};

async function navigate(page) {
  if (!PAGE_MAP[page]) page = 'dashboard';
  currentPage = page;

  // Update nav active state
  document.querySelectorAll('.nav-link[data-page], .bnav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

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
    const cleanup = await PAGE_MAP[page](content, store, { openTxModal, showToast, showConfirm, refreshPage: () => navigate(page) });
    pageCleanup = cleanup || null;
  } catch (err) {
    console.error(`Page ${page} error:`, err);
    content.innerHTML = `<div class="page-error"><strong>เกิดข้อผิดพลาด</strong><br/>${err.message}</div>`;
  }
}

function refreshPage() {
  navigate(currentPage);
}

// ── Nav click delegation ──────────────────────────────────────

document.getElementById('main-app')?.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-page]');
  if (navEl && navEl.dataset.page) {
    e.preventDefault();
    navigate(navEl.dataset.page);
  }

  // FAB add button
  if (e.target.closest('#btn-add-tx-fab') || e.target.closest('#btn-add-tx-top')) {
    openTxModal();
  }

  // Slip scan buttons
  if (e.target.closest('#btn-slip-fab') || e.target.closest('#topbar-btn-slip')) {
    openSlipModal();
  }
  if (e.target.closest('#btn-tx-modal-scan-slip')) {
    closeModal('tx-modal');
    openSlipModal();
  }
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
      showToast(`ซิงค์ข้อมูลกับ Supabase สำเร็จ (${result.count} รายการ) ⚡`);
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

// Auto-pull from Supabase when window regains focus or tab becomes visible
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
      case 'synced':   d.classList.add('synced');  if (l) l.textContent = 'Synced';   break;
      case 'pending':  d.classList.add('pending'); if (l) l.textContent = 'Pending';  break;
      case 'syncing':  d.classList.add('syncing'); if (l) l.textContent = 'Syncing…'; break;
      case 'error':    d.classList.add('error');   if (l) l.textContent = 'Error';    break;
      case 'conflict': d.classList.add('error');   if (l) l.textContent = 'Conflict'; break;
      default:         d.classList.add('offline'); if (l) l.textContent = 'Offline';  break;
    }
  };

  applyState(dot, label);
  applyState(topbarDot, null);
}

// ── Transaction modal ─────────────────────────────────────────

let txModalEditId = null;

async function openTxModal(txId = null) {
  txModalEditId = txId;

  const modal     = document.getElementById('tx-modal');
  const titleEl   = document.getElementById('tx-modal-title');
  const deleteBtn = document.getElementById('btn-delete-tx');
  const idInput   = document.getElementById('tx-id');

  // Populate selects
  const [accounts, categories] = await Promise.all([
    store.getAccounts(),
    store.getCategories(),
  ]);

  const accOpts = accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${a.name}</option>`).join('');
  document.getElementById('tx-account').innerHTML    = accOpts;
  document.getElementById('tx-from-account').innerHTML = accOpts;
  document.getElementById('tx-to-account').innerHTML   = accOpts;

  const expCats = categories.filter(c => c.type === 'expense' || c.type === 'both');
  const incCats = categories.filter(c => c.type === 'income'  || c.type === 'both');

  if (txId) {
    // Edit mode
    const tx = await store.get('transactions', txId);
    if (!tx) return;

    titleEl.textContent  = 'แก้ไขรายการ';
    deleteBtn.classList.remove('hidden');
    idInput.value = tx.id;

    // Set type tab
    setTxType(tx.type);

    document.getElementById('tx-amount').value = (tx.amountMinor / 100).toFixed(2);
    document.getElementById('tx-date').value   = tx.date;
    document.getElementById('tx-note').value   = tx.note || '';

    if (tx.type === 'transfer') {
      document.getElementById('tx-from-account').value = tx.fromAccountId || '';
      document.getElementById('tx-to-account').value   = tx.toAccountId   || '';
    } else {
      document.getElementById('tx-account').value = tx.accountId || '';
      const catSel = document.getElementById('tx-category');
      catSel.innerHTML = (tx.type === 'income' ? incCats : expCats)
        .map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');
      catSel.value = tx.categoryId || '';
    }

    // Set advance fields
    const isAdv = Boolean(tx.isAdvance);
    const advCheck = document.getElementById('tx-is-advance');
    const advBox   = document.getElementById('tx-advance-details');
    const advInput = document.getElementById('tx-advance-to');
    if (advCheck) advCheck.checked = isAdv;
    if (advBox) advBox.classList.toggle('hidden', !isAdv);
    if (advInput) advInput.value = tx.advanceTo || '';
  } else {
    // Add mode
    titleEl.textContent = 'เพิ่มรายการ';
    deleteBtn.classList.add('hidden');
    idInput.value = '';

    setTxType('expense');
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-date').value   = todayStr();
    document.getElementById('tx-note').value   = '';

    const advCheck = document.getElementById('tx-is-advance');
    const advBox   = document.getElementById('tx-advance-details');
    const advInput = document.getElementById('tx-advance-to');
    if (advCheck) advCheck.checked = false;
    if (advBox) advBox.classList.add('hidden');
    if (advInput) advInput.value = '';

    const catSel = document.getElementById('tx-category');
    catSel.innerHTML = expCats.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');
  }

  openModal('tx-modal');
}

function setTxType(type) {
  document.getElementById('tx-id') && (document.getElementById('tx-id').dataset.type = type);
  document.querySelectorAll('#tx-type-tabs .type-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });

  const isTransfer = type === 'transfer';
  document.getElementById('grp-account').classList.toggle('hidden', isTransfer);
  document.getElementById('grp-from-account').classList.toggle('hidden', !isTransfer);
  document.getElementById('grp-to-account').classList.toggle('hidden', !isTransfer);
  document.getElementById('grp-category').classList.toggle('hidden', isTransfer);
  document.getElementById('grp-advance')?.classList.toggle('hidden', type !== 'expense');

  // Update category options on type change
  if (!isTransfer) {
    store.getCategories().then(cats => {
      const filtered = cats.filter(c => c.type === type || c.type === 'both');
      document.getElementById('tx-category').innerHTML =
        filtered.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');
    });
  }
}

// Type tab clicks
document.getElementById('tx-type-tabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.type-tab');
  if (tab) setTxType(tab.dataset.type);
});

// Advance toggle in tx modal
document.getElementById('tx-is-advance')?.addEventListener('change', (e) => {
  document.getElementById('tx-advance-details')?.classList.toggle('hidden', !e.target.checked);
});

// Transaction form submit
document.getElementById('tx-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const activeTabs = document.querySelector('#tx-type-tabs .type-tab.active');
  const type       = activeTabs?.dataset.type || 'expense';
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
  showToast(editId ? 'แก้ไขรายการแล้ว' : 'เพิ่มรายการแล้ว');
  updateSyncWidget('synced');
  refreshPage();
});

// Delete transaction
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


// ── Slip modal (Batch Scan & Habit Matching) ──────────────────

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

function setSlipType(type) {
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
    const catSelect = document.getElementById('slip-category');
    if (catSelect && filtered.length) {
      const prevVal = catSelect.value;
      catSelect.innerHTML = filtered
        .map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`)
        .join('');
      if (filtered.some(c => c.id === prevVal)) catSelect.value = prevVal;
    }
    if (isSplitMode) {
      renderSplitItems();
    }
  }
}

// Slip type tab clicks
document.getElementById('slip-type-tabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.type-tab');
  if (tab) setSlipType(tab.dataset.type);
});

function setSplitMode(enabled) {
  isSplitMode = enabled;
  const toggleBtn = document.getElementById('btn-toggle-split');
  const singleSec = document.getElementById('slip-single-section');
  const splitSec  = document.getElementById('slip-split-section');

  if (toggleBtn) toggleBtn.textContent = enabled ? '← รวมเป็น 1 รายการ' : '➗ แยกหลายรายการ';
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
      banner.querySelector('span:first-child').textContent = '✓ จัดสรรครบลงตัวพอดี:';
      remainingVal.textContent = '0.00 ฿';
      if (saveBtn) saveBtn.disabled = false;
    } else if (remainingMinor > 0) {
      banner.classList.add('pending');
      banner.querySelector('span:first-child').textContent = 'คงเหลือต้องจัดสรร:';
      remainingVal.textContent = `${(remainingMinor / 100).toFixed(2)} ฿`;
      if (saveBtn) saveBtn.disabled = true;
    } else {
      banner.classList.add('over');
      banner.querySelector('span:first-child').textContent = '⚠️ เกินยอดสลิปไป:';
      remainingVal.textContent = `${(Math.abs(remainingMinor) / 100).toFixed(2)} ฿`;
      if (saveBtn) saveBtn.disabled = true;
    }
  }

  if (!container) return;

  const filteredCats = allLoadedCategories.filter(c => c.type === currentSlipType || c.type === 'both');
  const catOpts = (selectedCatId) => filteredCats
    .map(c => `<option value="${c.id}" ${c.id === selectedCatId ? 'selected' : ''}>${c.icon || ''} ${c.name}</option>`)
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

  // Wire events
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
      banner.querySelector('span:first-child').textContent = '✓ จัดสรรครบลงตัวพอดี:';
      remainingVal.textContent = '0.00 ฿';
      if (saveBtn) saveBtn.disabled = false;
    } else if (remainingMinor > 0) {
      banner.classList.add('pending');
      banner.querySelector('span:first-child').textContent = 'คงเหลือต้องจัดสรร:';
      remainingVal.textContent = `${(remainingMinor / 100).toFixed(2)} ฿`;
      if (saveBtn) saveBtn.disabled = true;
    } else {
      banner.classList.add('over');
      banner.querySelector('span:first-child').textContent = '⚠️ เกินยอดสลิปไป:';
      remainingVal.textContent = `${(Math.abs(remainingMinor) / 100).toFixed(2)} ฿`;
      if (saveBtn) saveBtn.disabled = true;
    }
  }
}

// Split Mode Listeners
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

async function openSlipModal() {
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

  openModal('slip-modal');
}
window.openSlipModal = openSlipModal;

async function handleSlipFiles(files) {
  if (!files || !files.length) return;

  const apiKey = getGeminiKey();
  if (!apiKey) {
    showToast('กรุณาระบุ Gemini API Key ในหน้าตั้งค่าก่อนสแกนสลิป', 'error');
    closeModal('slip-modal');
    navigate('settings');
    return;
  }

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
    showToast(`สแกนและบันทึกสลิปเรียบร้อย (${slipQueue.length} ใบ) 🎉`);
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
    // 1. Client-side compress & downscale to <250KB JPEG
    // Eliminates mobile memory exhaustion, prevents blank image render, and speeds up upload 10x
    const compressedBlob = await compressImage(rawFile, 1280, 0.82);

    // 2. Set thumbnail from compressed blob and manage object URL lifecycle
    revokeCurrentThumb();
    const thumbImg = document.getElementById('slip-thumb-img');
    if (thumbImg) {
      currentThumbUrl = URL.createObjectURL(compressedBlob);
      thumbImg.src = currentThumbUrl;
    }

    // 3. Send lightweight compressed blob to Gemini Flash Vision API
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

  const accSelect  = document.getElementById('slip-account');
  const fromSelect = document.getElementById('slip-from-account');
  const toSelect   = document.getElementById('slip-to-account');

  const accOptions = accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${a.name}</option>`).join('');

  if (accSelect)  accSelect.innerHTML  = accOptions;
  if (fromSelect) fromSelect.innerHTML = accOptions;
  if (toSelect) {
    toSelect.innerHTML = accOptions;
    if (accounts.length > 1) toSelect.value = accounts[1].id;
  }

  const habitData = getHabitData();
  const matchedAccId = matchBankToAccount(parsed.bank, accounts, habitData);
  if (matchedAccId) {
    if (accSelect)  accSelect.value  = matchedAccId;
    if (fromSelect) fromSelect.value = matchedAccId;
  }

  // Set detected or default type
  const initialType = parsed.type === 'income' ? 'income' : 'expense';
  setSlipType(initialType);

  // Suggest category for current type
  const filteredCats = categories.filter(c => c.type === initialType || c.type === 'both');
  const catSelect = document.getElementById('slip-category');
  if (catSelect && filteredCats.length) {
    const suggestedCatId = suggestCategory({
      memo: parsed.memo,
      bankCategoryTag: parsed.bankCategoryTag,
      payeeKey: parsed.payeeAccount,
      categories: filteredCats,
    });
    if (suggestedCatId) catSelect.value = suggestedCatId;
  }

  const amountInput = document.getElementById('slip-amount');
  const dateInput   = document.getElementById('slip-date');
  const noteInput   = document.getElementById('slip-note');

  if (amountInput) amountInput.value = (parsed.amountMinor / 100).toFixed(2);
  if (dateInput)   dateInput.value   = parsed.date || todayStr();
  if (noteInput)   noteInput.value   = parsed.memo || '';

  document.getElementById('slip-loading-section')?.classList.add('hidden');
  document.getElementById('slip-preview-section')?.classList.remove('hidden');
}

// Slip Form Submit (Confirm and Save)
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

    // Train habit engine on confirmed categorization and dynamic bank-to-account mapping
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
  showToast(`บันทึกสลิปใบที่ ${currentSlipIndex + 1} แล้ว ✓`);

  currentSlipIndex++;
  await processCurrentSlip();
});

// Skip button
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

// File upload triggers & Drag-and-Drop
document.getElementById('btn-browse-slips')?.addEventListener('click', () => {
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
    if (e.target.id !== 'btn-browse-slips') {
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
    setIconPicker('account-icon-picker', acc.icon || '💳');
  } else {
    titleEl.textContent = 'เพิ่มบัญชี';
    deleteBtn.classList.add('hidden');
    archiveBtn.classList.add('hidden');
    idInput.value = '';
    document.getElementById('account-name').value    = '';
    document.getElementById('account-balance').value = '0';
    document.getElementById('account-hidden-check').checked = false;
    setIconPicker('account-icon-picker', '💳');
  }
  openModal('account-modal');
};

document.getElementById('account-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = document.getElementById('account-id').value;
  const data = {
    name:                document.getElementById('account-name').value.trim(),
    initialBalanceMinor: parseAmount(document.getElementById('account-balance').value),
    icon:                getSelectedIcon('account-icon-picker'),
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
    setIconPicker('category-icon-picker', cat.icon || '📦');
  } else {
    titleEl.textContent = 'เพิ่มหมวดหมู่';
    deleteBtn.classList.add('hidden');
    idInput.value = '';
    document.getElementById('category-name').value = '';
    document.querySelector('input[name="cat-type"][value="expense"]').checked = true;
    setIconPicker('category-icon-picker', '📦');
  }
  openModal('category-modal');
};

document.getElementById('category-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = document.getElementById('category-id').value;
  const data = {
    name: document.getElementById('category-name').value.trim(),
    type: document.querySelector('input[name="cat-type"]:checked')?.value || 'expense',
    icon: getSelectedIcon('category-icon-picker'),
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

window.openBudgetModal = async function(budgetId = null, defaultMonth = null) {
  const titleEl    = document.getElementById('budget-modal-title');
  const idInput    = document.getElementById('budget-id');
  const deleteBtn  = document.getElementById('btn-delete-budget');
  const noMonthCb  = document.getElementById('budget-no-month');
  const monthGrp   = document.getElementById('grp-budget-month');
  const cats       = await store.getCategories('expense');

  document.getElementById('budget-category').innerHTML =
    cats.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');

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
    document.getElementById('budget-category').value = b.categoryId;
    const isTemplate = b.month == null;
    noMonthCb.checked = isTemplate;
    if (!isTemplate) document.getElementById('budget-month').value = b.month;
    document.getElementById('budget-limit').value = (b.limitMinor / 100).toFixed(2);
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'ตั้งงบประมาณ';
    idInput.value = '';
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
    showToast('กรุณาระบุเดือน หรือเลือก "ใช้ทุกเดือน"', 'error');
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
    // Check if budget for same category and month already exists
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
    accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${a.name}</option>`).join('');

  document.getElementById('sub-category').innerHTML =
    categories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');

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
    setIconPicker('sub-icon-picker', sub.icon || '🎬');
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'เพิ่มรายจ่ายประจำ';
    idInput.value = '';
    document.getElementById('sub-name').value = '';
    document.getElementById('sub-amount').value = '';
    document.getElementById('sub-due-day').value = new Date().getDate();
    document.getElementById('sub-note').value = '';
    setIconPicker('sub-icon-picker', '🎬');
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
  const icon = getSelectedIcon('sub-icon-picker');

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
  showToast(editId ? 'แก้ไขรายจ่ายประจำแล้ว' : 'เพิ่มรายจ่ายประจำแล้ว ✓');
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


// ── Settings page ─────────────────────────────────────────────

async function initSettings(container) {
  const cfg = getConfig() || {};
  const supaCfg = getSupabaseConfig();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ตั้งค่า</h1>
    </div>
    <div class="page-body">
      <!-- Supabase Cloud Sync Card -->
      <div class="card" style="max-width:480px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h3 class="card-title" style="margin:0">Supabase Cloud Sync (PostgreSQL)</h3>
          <span class="badge badge-income">Auto-Sync ⚡</span>
        </div>
        <p style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          บันทึกและซิงค์ข้อมูลบนคลาวด์อัตโนมัติ รวดเร็วระดับมิลลิวินาที ปลอดภัย และรีเฟรชไม่ทับข้อมูลเก่า
        </p>
        <form id="supabase-form" autocomplete="off" style="margin-top:12px">
          <div class="field">
            <label>Project URL</label>
            <input type="text" id="s-supabase-url" value="${supaCfg.url}" placeholder="https://xxxx.supabase.co" />
          </div>
          <div class="field">
            <label>Publishable / Anon Key</label>
            <input type="password" id="s-supabase-key" value="${supaCfg.key}" placeholder="sb_publishable_..." />
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button type="submit" class="btn-primary">บันทึก Supabase Key</button>
            <button type="button" id="s-supabase-test" class="btn-ghost">ทดสอบการเชื่อมต่อ</button>
          </div>
          <div id="s-supabase-result" style="margin-top:10px;font-size:13px"></div>
        </form>
      </div>

      <!-- Cloud Migration Card -->
      <div class="card" style="max-width:480px;margin-top:16px">
        <h3 class="card-title">จัดการข้อมูล Cloud (One-Click Migration)</h3>
        <p style="margin-top:4px;font-size:12px;color:var(--text-muted)">
          ส่งข้อมูลเดิมทั้งหมดในเครื่องขึ้น Supabase ทันที หรือดึงข้อมูลล่าสุดจาก Cloud
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn-primary" id="s-migrate-supabase" style="background:var(--income);border-color:var(--income)">
            🚀 ส่งข้อมูลในเครื่องขึ้น Supabase (Migration)
          </button>
          <button class="btn-ghost" id="s-pull-supabase">
            🔄 ดึงข้อมูลล่าสุดจาก Supabase (Pull)
          </button>
        </div>
        <div id="s-migrate-result" style="margin-top:10px;font-size:13px"></div>
      </div>

      <div class="card" style="max-width:480px;margin-top:16px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <h3 class="card-title" style="margin:0">AI สแกนสลิป (Gemini Vision)</h3>
          <span class="badge ${getGeminiKey() ? 'badge-income' : 'badge-neutral'}">
            ${getGeminiKey() ? 'พร้อมใช้งาน' : 'ยังไม่ได้ตั้งค่า'}
          </span>
        </div>
        <p style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          สกัดยอดเงิน วันที่ และบันทึกช่วยจำจากสลิปโอนเงิน (ฟรี 1,500 ครั้ง/วัน ผ่าน Google AI Studio)
        </p>
        <form id="gemini-key-form" autocomplete="off" style="margin-top:10px">
          <div class="field">
            <label>Gemini API Key</label>
            <input type="password" id="s-gemini-key" value="${getGeminiKey()}" placeholder="AIzaSy..." />
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
            <button type="submit" class="btn-primary">บันทึก Key</button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="btn-ghost" style="font-size:12px;text-decoration:none">
              รับ API Key ฟรี ↗
            </a>
          </div>
        </form>
      </div>
      <div class="card" style="max-width:480px;margin-top:16px">
        <h3 class="card-title">ธีม & ลักษณะ</h3>
        <div class="toggle-row">
          <span class="toggle-label">Dark Mode</span>
          <label class="toggle-switch">
            <input type="checkbox" id="s-dark-mode" ${localStorage.getItem(DARK_KEY) === '1' ? 'checked' : ''}>
            <span class="toggle-knob"></span>
          </label>
        </div>
        <div style="margin-top:14px;font-size:12px;color:var(--text-muted);margin-bottom:8px">สีหลัก</div>
        <div class="theme-picker" id="s-theme-picker">
          ${THEMES.map(t => `
            <button type="button" class="theme-swatch ${(localStorage.getItem(THEME_KEY) || 'teal') === t.id ? 'selected' : ''}" data-theme-id="${t.id}" style="background:${t.color}" title="${t.name}">
              <span class="theme-check">✓</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="card" style="max-width:480px;margin-top:16px">
        <h3 class="card-title">ฟอนต์</h3>
        <div class="font-picker" id="s-font-picker">
          ${FONTS.map(f => `
            <button type="button" class="font-option ${(localStorage.getItem(FONT_KEY) || 'dm-sans') === f.id ? 'selected' : ''}" data-font-id="${f.id}" style="font-family:${f.css}">
              <span class="font-option-sample">${f.sample}</span>
              <span class="font-option-check">✓</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="card" style="max-width:480px;margin-top:16px">
        <h3 class="card-title">ข้อมูล</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-ghost" id="s-pull-all">ดึงข้อมูลจาก GitHub</button>
          <button class="btn-ghost" id="s-export-all">Export ข้อมูลทั้งหมด (.xlsx)</button>
          <button class="btn-danger" id="s-clear-cache">ล้างข้อมูลใน Cache</button>
        </div>
        <p style="margin-top:8px;font-size:12px;color:var(--text-muted)">
          "ดึงข้อมูลจาก GitHub" ใช้เมื่อเปิดแอปใน browser/device ใหม่ เพื่อโหลดข้อมูลทั้งหมดลงมา
        </p>
      </div>
    </div>
  `;

  document.getElementById('supabase-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('s-supabase-url').value.trim();
    const key = document.getElementById('s-supabase-key').value.trim();
    saveSupabaseConfig(url, key);
    showToast('บันทึกการตั้งค่า Supabase แล้ว ⚡');
  });

  document.getElementById('s-supabase-test')?.addEventListener('click', async () => {
    const resEl = document.getElementById('s-supabase-result');
    resEl.textContent = 'กำลังทดสอบเชื่อมต่อ...';
    resEl.style.color = 'var(--primary)';
    const r = await testSupabaseConnection();
    if (r.ok) {
      resEl.textContent = '✓ เชื่อมต่อกับ Supabase สำเร็จ พร้อมใช้งาน!';
      resEl.style.color = 'var(--income)';
    } else {
      resEl.textContent = `✗ ล้มเหลว: ${r.error || 'HTTP ' + r.status}`;
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
    resEl.style.color = 'var(--primary)';
    try {
      const stats = await migrateAllToSupabase(store);
      resEl.textContent = `✓ ส่งข้อมูลสำเร็จ: ${stats.accounts} บัญชี, ${stats.categories} หมวดหมู่, ${stats.budgets} งบประมาณ, ${stats.transactions} รายการ`;
      resEl.style.color = 'var(--income)';
      showToast('ส่งข้อมูลขึ้น Supabase สำเร็จทั้งหมดแล้ว! 🎉');
      updateSyncWidget('synced');
    } catch (err) {
      resEl.textContent = `✗ ล้มเหลว: ${err.message}`;
      resEl.style.color = 'var(--expense)';
      showToast('เกิดข้อผิดพลาดในการส่งข้อมูล: ' + err.message, 'error');
    }
  });

  document.getElementById('s-pull-supabase')?.addEventListener('click', async () => {
    updateSyncWidget('syncing');
    const result = await pullAllFromSupabase(store);
    if (result.ok) {
      updateSyncWidget('synced');
      showToast(`ดึงข้อมูลจาก Supabase สำเร็จ (${result.count} รายการ) ⚡`);
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

  document.getElementById('s-dark-mode').addEventListener('change', (e) => {
    applyDarkMode(e.target.checked);
  });

  document.getElementById('s-theme-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-id]');
    if (!btn) return;
    const themeId = btn.dataset.themeId;
    applyTheme(themeId);
    document.querySelectorAll('#s-theme-picker .theme-swatch').forEach(el => {
      el.classList.toggle('selected', el.dataset.themeId === themeId);
    });
  });

  document.getElementById('s-font-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-font-id]');
    if (!btn) return;
    const fontId = btn.dataset.fontId;
    applyFont(fontId);
    document.querySelectorAll('#s-font-picker .font-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.fontId === fontId);
    });
  });

  document.getElementById('s-test')?.addEventListener('click', async () => {
    const result = document.getElementById('s-result');
    if (!result) return;
    result.textContent = 'กำลังทดสอบ...';
    const r = await syncer.testConnection();
    result.textContent = r.ok ? '✓ เชื่อมต่อสำเร็จ' : `✗ ${r.error}`;
    result.style.color = r.ok ? 'var(--income)' : 'var(--expense)';
  });

  document.getElementById('s-clear')?.addEventListener('click', async () => {
    const ok = await showConfirm('ลบ Token', 'ต้องการลบ GitHub token ออกจากเครื่องนี้หรือไม่?');
    if (!ok) return;
    const { clearConfig } = await import('./settings.js');
    clearConfig();
    showToast('ลบ token แล้ว');
    navigate('settings');
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


  document.getElementById('s-export-all').addEventListener('click', async () => {
    const [txs, activeAccs, archivedAccs, cats, budgets] = await Promise.all([
      store.getTransactions({}),
      store.getAccounts(),
      store.getArchivedAccounts(),
      store.getCategories(),
      store.getAll('budgets'),
    ]);
    exportTransactions(txs, [...activeAccs, ...archivedAccs], cats, budgets, 'finance-tracker-export');
  });

  document.getElementById('s-clear-cache').addEventListener('click', async () => {
    const ok = await showConfirm('ล้างข้อมูล', 'ข้อมูลทั้งหมดในเครื่องจะถูกลบ ดำเนินการต่อ?');
    if (!ok) return;
    const dbs = await indexedDB.databases?.() || [];
    for (const db of dbs) {
      if (db.name === 'finance_tracker_v2') indexedDB.deleteDatabase(db.name);
    }
    showToast('ล้างข้อมูลแล้ว กำลัง reload...');
    setTimeout(() => location.reload(), 1000);
  });
}

// ── Icon picker ───────────────────────────────────────────────

document.addEventListener('click', (e) => {
  const opt = e.target.closest('.icon-opt');
  if (!opt) return;
  const picker = opt.closest('.icon-picker');
  if (!picker) return;
  picker.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
});

function setIconPicker(pickerId, icon) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  picker.querySelectorAll('.icon-opt').forEach(o => {
    o.classList.toggle('selected', o.dataset.icon === icon);
  });
}

function getSelectedIcon(pickerId) {
  const picker = document.getElementById(pickerId);
  return picker?.querySelector('.icon-opt.selected')?.dataset.icon || '📦';
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
  }
}

// Close on backdrop click or [data-close] buttons (modals live outside #main-app)
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
    document.body.style.overflow = '';
    if (e.target.id === 'slip-modal') {
      revokeCurrentThumb();
      isProcessingSlip = false;
    }
    return;
  }
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) {
    closeModal(closeBtn.dataset.close);
  }
});

// ESC key closes modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
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
  // Close on backdrop tap
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
    // Prevent double operators
    const ops = ['+', '-', '×'];
    if (ops.includes(key) && ops.includes(_calcExpr.slice(-1))) {
      _calcExpr = _calcExpr.slice(0, -1) + key;
    } else {
      _calcExpr += key;
    }
  }

  display.textContent = _calcExpr || '0';
});

// Intercept focus on any [data-calculator] input
document.addEventListener('focusin', e => {
  const input = e.target;
  if (input.tagName === 'INPUT' && 'calculator' in input.dataset) {
    input.blur();
    showCalc(input);
  }
}, true);

// ── Expose openTxModal for pages ──────────────────────────────

export { openTxModal };

// ── Start ─────────────────────────────────────────────────────

boot().catch(err => {
  console.error('Boot failed:', err);
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#DC2626">
    <strong>เกิดข้อผิดพลาด:</strong> ${err.message}<br/>
    <small>กรุณา reload หน้าและลองใหม่</small>
  </div>`;
});
