// ─────────────────────────────────────────────────────────────
//  sync.js — GitHub Contents API sync layer
//  Strategy: push-all (upload snapshot) / pull-all (replace local)
// ─────────────────────────────────────────────────────────────

import {
  getConfig,
  getLastSync,  // eslint-disable-line no-unused-vars
  setLastSync,
  setSyncState,
} from './settings.js';

const GITHUB_API = 'https://api.github.com';

export class GitHubSync {

  // ── Internal helpers ────────────────────────────────────────

  _headers() {
    const cfg = getConfig();
    if (!cfg) throw new Error('GitHub sync is not configured');
    return {
      'Authorization': `token ${cfg.token}`,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json',
    };
  }

  _cfg() {
    const cfg = getConfig();
    if (!cfg) throw new Error('GitHub sync is not configured');
    return cfg;
  }

  _b64encode(obj) {
    const json = JSON.stringify(obj, null, 2);
    return btoa(unescape(encodeURIComponent(json)));
  }

  _b64decode(b64) {
    return JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))));
  }

  // ── Public API ─────────────────────────────────────────────

  async testConnection() {
    try {
      const { owner, repo } = this._cfg();
      const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
        headers: this._headers(),
      });
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.message ?? `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async readFile(path) {
    try {
      const { owner, repo, branch } = this._cfg();
      const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
      const res = await fetch(url, { headers: this._headers() });

      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      return { content: this._b64decode(data.content), sha: data.sha };
    } catch (err) {
      if (err.message === 'HTTP 404') return null;
      throw err;
    }
  }

  async writeFile(path, content, sha, message) {
    try {
      const { owner, repo, branch } = this._cfg();
      const body = {
        message: message ?? `Update ${path}`,
        content: this._b64encode(content),
        branch,
      };
      if (sha) body.sha = sha;

      const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
        { method: 'PUT', headers: this._headers(), body: JSON.stringify(body) }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { ok: false, sha: null, error: errBody.message ?? `HTTP ${res.status}` };
      }

      const data = await res.json();
      return { ok: true, sha: data.content.sha, error: null };
    } catch (err) {
      return { ok: false, sha: null, error: err.message };
    }
  }

  async ensureDataStructure() {
    const stubs = [
      { path: 'data/accounts.json',   content: [] },
      { path: 'data/categories.json', content: [] },
      { path: 'data/budgets.json',    content: [] },
      { path: 'data/meta.json',       content: { version: 2, createdAt: new Date().toISOString(), months: [] } },
    ];
    for (const stub of stubs) {
      const existing = await this.readFile(stub.path);
      if (!existing) {
        await this.writeFile(stub.path, stub.content, null, `Initialize ${stub.path}`);
      }
    }
  }

  // ── Push a single file (read SHA → write) ──────────────────

  async _pushFile(path, content) {
    const existing = await this.readFile(path);
    const result   = await this.writeFile(path, content, existing?.sha ?? null, `Update ${path}`);
    if (!result.ok) throw new Error(result.error ?? `Failed to write ${path}`);
  }

  // ── Sync All = Upload current local snapshot to GitHub ──────

  /**
   * Push the complete local state to GitHub.
   * Only non-deleted records are pushed — deletions are implicit (absent from snapshot).
   * Other devices get the deletion when they pull.
   *
   * @param {import('./local-store.js').LocalStore} store
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async syncAll(store) {
    try {
      setSyncState('pending');

      const [accounts, categories, budgets, allTx] = await Promise.all([
        store.getAll('accounts'),
        store.getAll('categories'),
        store.getAll('budgets'),
        store.getAll('transactions'),
      ]);

      // Group non-deleted transactions by month
      const byMonth = new Map();
      for (const tx of allTx) {
        const month = tx.date?.slice(0, 7);
        if (!month) continue;
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month).push(tx);
      }

      // Push static collections
      await this._pushFile('data/accounts.json',   accounts);
      await this._pushFile('data/categories.json', categories);
      await this._pushFile('data/budgets.json',    budgets);

      // Push each month's transactions
      for (const [month, txs] of byMonth) {
        await this._pushFile(`data/transactions/${month}.json`, txs);
      }

      // Clear sync queue — everything is now on GitHub
      const queue = await store.getPendingQueue();
      for (const op of queue) await store.clearPendingItem(op.id);

      setLastSync(new Date().toISOString());
      setSyncState('synced');
      return { ok: true };
    } catch (err) {
      setSyncState('error');
      return { ok: false, error: err.message };
    }
  }

  // ── Pull All = Download GitHub snapshot, replace local ──────

  /**
   * Download the full GitHub snapshot and replace all local data.
   * Clears local stores first so deletions from other devices take effect.
   *
   * @param {import('./local-store.js').LocalStore} store
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async pullAll(store) {
    try {
      setSyncState('pending');

      // Pull everything from GitHub
      const [accFile, catFile, bgtFile] = await Promise.all([
        this.readFile('data/accounts.json'),
        this.readFile('data/categories.json'),
        this.readFile('data/budgets.json'),
      ]);

      const months  = await this._listTransactionMonths();
      const txFiles = await Promise.all(months.map(m => this.readFile(`data/transactions/${m}.json`)));

      // Replace local stores completely
      await store.clearStore('transactions');
      await store.clearStore('accounts');
      await store.clearStore('categories');
      await store.clearStore('budgets');
      await store.clearStore('sync_queue');

      for (const acc of accFile?.content ?? []) await store.put('accounts',     { ...acc, synced: true });
      for (const cat of catFile?.content ?? []) await store.put('categories',   { ...cat, synced: true });
      for (const bgt of bgtFile?.content ?? []) await store.put('budgets',      { ...bgt, synced: true });
      for (const f   of txFiles)
        for (const tx of f?.content ?? [])      await store.put('transactions', { ...tx,  synced: true });

      setLastSync(new Date().toISOString());
      setSyncState('synced');
      return { ok: true };
    } catch (err) {
      setSyncState('error');
      return { ok: false, error: err.message };
    }
  }

  // ── List transaction months from GitHub ─────────────────────

  async _listTransactionMonths() {
    try {
      const { owner, repo, branch } = this._cfg();
      const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/data/transactions?ref=${encodeURIComponent(branch)}`,
        { headers: this._headers() }
      );

      if (res.status === 404) {
        const meta = await this.readFile('data/meta.json');
        return meta?.content?.months ?? [];
      }
      if (!res.ok) return [];

      const files = await res.json();
      return files
        .filter(f => f.type === 'file' && /^\d{4}-\d{2}\.json$/.test(f.name))
        .map(f => f.name.replace('.json', ''));
    } catch {
      return [];
    }
  }
}
