// ─────────────────────────────────────────────────────────────
//  app.js — entry point, router, shared modal management
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { LocalStore }                    from './local-store.js';
import { getConfig, saveConfig, isConfigured, getSyncState, getLastSync } from './settings.js';
import { GitHubSync }                    from './sync.js';
import { makeTransaction, makeAccount, makeCategory, makeBudget, todayStr, currentMonth } from './schema.js';
import { parseAmount, formatTHB, formatMonth } from './format.js';
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
  { id: 'teal',   name: 'Teal',   color: '#0D9488', p600: '#0F766E', p700: '#115E59', p50: '#F0FDFA' },
  { id: 'indigo', name: 'Indigo', color: '#6366F1', p600: '#4F46E5', p700: '#4338CA', p50: '#EEF2FF' },
  { id: 'violet', name: 'Violet', color: '#8B5CF6', p600: '#7C3AED', p700: '#6D28D9', p50: '#F5F3FF' },
  { id: 'rose',   name: 'Rose',   color: '#F43F5E', p600: '#E11D48', p700: '#BE123C', p50: '#FFF1F2' },
  { id: 'amber',  name: 'Amber',  color: '#F59E0B', p600: '#D97706', p700: '#B45309', p50: '#FFFBEB' },
  { id: 'blue',   name: 'Blue',   color: '#3B82F6', p600: '#2563EB', p700: '#1D4ED8', p50: '#EFF6FF' },
  { id: 'green',  name: 'Green',  color: '#22C55E', p600: '#16A34A', p700: '#15803D', p50: '#F0FDF4' },
  { id: 'slate',  name: 'Slate',  color: '#64748B', p600: '#475569', p700: '#334155', p50: '#F8FAFC' },
];

const THEME_KEY = 'ft_theme';

function applyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--primary',     theme.color);
  r.setProperty('--primary-600', theme.p600);
  r.setProperty('--primary-700', theme.p700);
  r.setProperty('--primary-50',  theme.p50);
  localStorage.setItem(THEME_KEY, theme.id);
}

// Apply saved theme on boot
applyTheme(localStorage.getItem(THEME_KEY) || 'teal');

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

  // Pull latest data from GitHub on every boot
  if (isConfigured()) {
    updateSyncWidget('syncing');
    const result = await syncer.pullAll(store);
    if (result.ok) {
      updateSyncWidget('synced');
      navigate('dashboard');
    } else {
      updateSyncWidget('error');
      // Silent fail on boot — user can retry via Settings
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

});

// ── Sync ──────────────────────────────────────────────────────

document.getElementById('btn-sync')?.addEventListener('click', doSync);
document.getElementById('topbar-btn-sync')?.addEventListener('click', doSync);
document.getElementById('topbar-btn-settings')?.addEventListener('click', () => navigate('settings'));

async function doSync() {
  if (!isConfigured()) {
    showToast('ยังไม่ได้ตั้งค่า GitHub', 'error');
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
  } else {
    // Add mode
    titleEl.textContent = 'เพิ่มรายการ';
    deleteBtn.classList.add('hidden');
    idInput.value = '';

    setTxType('expense');
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-date').value   = todayStr();
    document.getElementById('tx-note').value   = '';

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
    txData = {
      type, amountMinor, date, note,
      fromAccountId: document.getElementById('tx-from-account').value,
      toAccountId:   document.getElementById('tx-to-account').value,
    };
  } else {
    txData = {
      type, amountMinor, date, note,
      accountId:  document.getElementById('tx-account').value,
      categoryId: document.getElementById('tx-category').value,
    };
  }

  if (editId) {
    const existing = await store.get('transactions', editId);
    if (existing) {
      Object.assign(existing, txData, { updatedAt: new Date().toISOString(), synced: false, pendingOp: 'update' });
      await store.put('transactions', existing);
      await store.addToPendingQueue({ id: editId, store: 'transactions', op: 'update' });
    }
  } else {
    const tx = makeTransaction(txData);
    await store.put('transactions', tx);
    await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
  }

  closeModal('tx-modal');
  showToast(editId ? 'แก้ไขรายการแล้ว' : 'เพิ่มรายการแล้ว');
  updateSyncWidget('pending');
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
  closeModal('tx-modal');
  showToast('ลบรายการแล้ว');
  updateSyncWidget('pending');
  refreshPage();
});

// ── Account modal ─────────────────────────────────────────────

window.openAccountModal = async function(accountId = null) {
  const titleEl   = document.getElementById('account-modal-title');
  const deleteBtn = document.getElementById('btn-delete-account');
  const idInput   = document.getElementById('account-id');

  if (accountId) {
    const acc = await store.get('accounts', accountId);
    if (!acc) return;
    titleEl.textContent = 'แก้ไขบัญชี';
    deleteBtn.classList.remove('hidden');
    idInput.value = acc.id;
    document.getElementById('account-name').value    = acc.name;
    document.getElementById('account-balance').value = (acc.initialBalanceMinor / 100).toFixed(2);
    document.getElementById('account-hidden-check').checked = !!acc.hidden;
    setIconPicker('account-icon-picker', acc.icon || '💳');
  } else {
    titleEl.textContent = 'เพิ่มบัญชี';
    deleteBtn.classList.add('hidden');
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
    Object.assign(existing, data, { updatedAt: new Date().toISOString(), synced: false });
    await store.put('accounts', existing);
  } else {
    await store.put('accounts', makeAccount(data));
  }

  closeModal('account-modal');
  showToast(editId ? 'แก้ไขบัญชีแล้ว' : 'เพิ่มบัญชีแล้ว');
  refreshPage();
});

document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
  const editId = document.getElementById('account-id').value;
  const ok = await showConfirm('ลบบัญชี', 'ต้องการลบบัญชีนี้หรือไม่? รายการที่ผ่านมาจะยังคงอยู่');
  if (!ok) return;
  await store.softDelete('accounts', editId);
  closeModal('account-modal');
  showToast('ลบบัญชีแล้ว');
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
    Object.assign(existing, data, { updatedAt: new Date().toISOString() });
    await store.put('categories', existing);
  } else {
    await store.put('categories', makeCategory(data));
  }

  closeModal('category-modal');
  showToast(editId ? 'แก้ไขหมวดหมู่แล้ว' : 'เพิ่มหมวดหมู่แล้ว');
  refreshPage();
});

document.getElementById('btn-delete-category')?.addEventListener('click', async () => {
  const editId = document.getElementById('category-id').value;
  const ok = await showConfirm('ลบหมวดหมู่', 'ต้องการลบหมวดหมู่นี้หรือไม่?');
  if (!ok) return;
  await store.softDelete('categories', editId);
  closeModal('category-modal');
  showToast('ลบหมวดหมู่แล้ว');
  refreshPage();
});

// ── Budget modal ──────────────────────────────────────────────

window.openBudgetModal = async function(budgetId = null, defaultMonth = null) {
  const titleEl   = document.getElementById('budget-modal-title');
  const idInput   = document.getElementById('budget-id');
  const deleteBtn = document.getElementById('btn-delete-budget');
  const cats      = await store.getCategories('expense');

  document.getElementById('budget-category').innerHTML =
    cats.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');

  if (budgetId) {
    const b = await store.get('budgets', budgetId);
    if (!b) return;
    titleEl.textContent = 'แก้ไขงบประมาณ';
    idInput.value = b.id;
    document.getElementById('budget-category').value = b.categoryId;
    document.getElementById('budget-month').value    = b.month;
    document.getElementById('budget-limit').value    = (b.limitMinor / 100).toFixed(2);
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = 'ตั้งงบประมาณ';
    idInput.value = '';
    document.getElementById('budget-month').value = defaultMonth || currentMonth();
    document.getElementById('budget-limit').value = '';
    deleteBtn.classList.add('hidden');
  }
  openModal('budget-modal');
};

document.getElementById('btn-delete-budget')?.addEventListener('click', async () => {
  const editId = document.getElementById('budget-id').value;
  if (!editId) return;
  const ok = await showConfirm('ลบงบประมาณ', 'ต้องการลบงบประมาณหมวดนี้หรือไม่?');
  if (!ok) return;
  await store.softDelete('budgets', editId);
  closeModal('budget-modal');
  showToast('ลบงบประมาณแล้ว');
  refreshPage();
});

document.getElementById('budget-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const editId = document.getElementById('budget-id').value;
  const data = {
    categoryId: document.getElementById('budget-category').value,
    month:      document.getElementById('budget-month').value,
    limitMinor: parseAmount(document.getElementById('budget-limit').value),
  };

  if (editId) {
    const existing = await store.get('budgets', editId);
    Object.assign(existing, data, { updatedAt: new Date().toISOString() });
    await store.put('budgets', existing);
  } else {
    await store.put('budgets', makeBudget(data));
  }

  closeModal('budget-modal');
  showToast(editId ? 'แก้ไขงบประมาณแล้ว' : 'ตั้งงบประมาณแล้ว');
  refreshPage();
});

// ── Settings page ─────────────────────────────────────────────

async function initSettings(container) {
  const cfg = getConfig() || {};
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ตั้งค่า</h1>
    </div>
    <div class="page-body">
      <div class="card" style="max-width:480px">
        <h3 class="card-title">GitHub Sync</h3>
        <form id="settings-form" autocomplete="off">
          <div class="field">
            <label>Owner</label>
            <input type="text" id="s-owner" value="${cfg.owner || ''}" placeholder="username" />
          </div>
          <div class="field">
            <label>Repository</label>
            <input type="text" id="s-repo" value="${cfg.repo || ''}" placeholder="finance-data" />
          </div>
          <div class="field">
            <label>Branch</label>
            <input type="text" id="s-branch" value="${cfg.branch || 'main'}" placeholder="main" />
          </div>
          <div class="field">
            <label>Personal Access Token</label>
            <input type="password" id="s-token" value="${cfg.token || ''}" placeholder="ghp_..." />
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button type="submit" class="btn-primary">บันทึก</button>
            <button type="button" id="s-test" class="btn-ghost">ทดสอบการเชื่อมต่อ</button>
            <button type="button" id="s-clear" class="btn-danger" style="margin-left:auto">ลบ Token</button>
          </div>
          <div id="s-result" style="margin-top:12px;font-size:13px"></div>
        </form>
      </div>
      <div class="card" style="max-width:480px;margin-top:16px">
        <h3 class="card-title">ธีมสี</h3>
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

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    saveConfig({
      owner:  document.getElementById('s-owner').value.trim(),
      repo:   document.getElementById('s-repo').value.trim(),
      branch: document.getElementById('s-branch').value.trim() || 'main',
      token:  document.getElementById('s-token').value.trim(),
    });
    showToast('บันทึกการตั้งค่าแล้ว');
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

  document.getElementById('s-test').addEventListener('click', async () => {
    const result = document.getElementById('s-result');
    result.textContent = 'กำลังทดสอบ...';
    const r = await syncer.testConnection();
    result.textContent = r.ok ? '✓ เชื่อมต่อสำเร็จ' : `✗ ${r.error}`;
    result.style.color = r.ok ? 'var(--income)' : 'var(--expense)';
  });

  document.getElementById('s-clear').addEventListener('click', async () => {
    const ok = await showConfirm('ลบ Token', 'ต้องการลบ GitHub token ออกจากเครื่องนี้หรือไม่?');
    if (!ok) return;
    const { clearConfig } = await import('./settings.js');
    clearConfig();
    showToast('ลบ token แล้ว');
    navigate('settings');
  });

  document.getElementById('s-pull-all').addEventListener('click', async () => {
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
    const [txs, accs, cats] = await Promise.all([
      store.getTransactions({}),
      store.getAccounts(),
      store.getCategories(),
    ]);
    exportTransactions(txs, accs, cats, 'finance-tracker-export');
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
}

// Close on backdrop click or [data-close] buttons (modals live outside #main-app)
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
    document.body.style.overflow = '';
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
