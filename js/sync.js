// ─────────────────────────────────────────────────────────────
//  sync.js — GitHub Contents API sync layer
//  Finance Tracker v2
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

  /** Build required request headers. Throws if not configured. */
  _headers() {
    const cfg = getConfig();
    if (!cfg) throw new Error('GitHub sync is not configured');
    return {
      'Authorization': `token ${cfg.token}`,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json',
    };
  }

  /** Return config, throwing if not configured. */
  _cfg() {
    const cfg = getConfig();
    if (!cfg) throw new Error('GitHub sync is not configured');
    return cfg;
  }

  /**
   * Encode a JS value to Base64 (UTF-8 safe).
   * GitHub Contents API requires Base64-encoded content.
   */
  _b64encode(obj) {
    // JSON → UTF-8 bytes → base64
    const json = JSON.stringify(obj, null, 2);
    // encodeURIComponent escapes all non-ASCII, unescape converts %XX → byte chars
    return btoa(unescape(encodeURIComponent(json)));
  }

  /** Decode Base64 content from GitHub API response (removes line breaks first). */
  _b64decode(b64) {
    return JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))));
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Verify the GitHub connection by fetching repo metadata.
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
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

  /**
   * Read and parse a JSON file from the repository.
   * @param {string} path — e.g. "data/transactions/2026-06.json"
   * @returns {Promise<{content: any, sha: string}|null>} null if file does not exist
   */
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
      return {
        content: this._b64decode(data.content),
        sha:     data.sha,
      };
    } catch (err) {
      if (err.message === 'HTTP 404') return null;
      throw err;
    }
  }

  /**
   * Create or update a JSON file in the repository.
   *
   * @param {string}      path     — repository path
   * @param {any}         content  — value to serialize as JSON
   * @param {string|null} sha      — current file SHA (required for updates, null for create)
   * @param {string}      [message] — commit message
   * @returns {Promise<{ok: boolean, sha: string|null, error: string|null}>}
   */
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

  /**
   * Ensure the data directory structure exists in the repository.
   * Creates accounts.json, categories.json, budgets.json, and meta.json
   * with empty defaults if they do not already exist.
   */
  async ensureDataStructure() {
    const metaContent = {
      version:   2,
      createdAt: new Date().toISOString(),
      months:    [],
    };

    const stubs = [
      { path: 'data/accounts.json',   content: [] },
      { path: 'data/categories.json', content: [] },
      { path: 'data/budgets.json',    content: [] },
      { path: 'data/meta.json',       content: metaContent },
    ];

    for (const stub of stubs) {
      const existing = await this.readFile(stub.path);
      if (!existing) {
        await this.writeFile(stub.path, stub.content, null, `Initialize ${stub.path}`);
      }
    }
  }

  /**
   * Fetch transaction data for a specific month from GitHub.
   * @param {string} month — YYYY-MM
   * @returns {Promise<{content: Object[], sha: string}|null>}
   */
  async pullMonth(month) {
    return this.readFile(`data/transactions/${month}.json`);
  }

  /**
   * Write transaction data for a specific month to GitHub.
   * @param {string}   month        — YYYY-MM
   * @param {Object[]} transactions — array of transaction objects
   * @param {string|null} sha       — current file SHA (null to create)
   * @returns {Promise<{ok: boolean, sha: string|null, error: string|null}>}
   */
  async pushMonth(month, transactions, sha) {
    return this.writeFile(
      `data/transactions/${month}.json`,
      transactions,
      sha,
      `Update transactions ${month}`
    );
  }

  // ── Merge logic ────────────────────────────────────────────

  /**
   * Merge pending local operations on top of remote transaction array.
   * Strategy: last-write-wins for edits; soft-deletes are always applied.
   *
   * @param {Object[]} remote  — records fetched from GitHub
   * @param {Object[]} pending — local pending ops from sync_queue
   * @returns {Object[]}
   */
  _mergeTransactions(remote, pending) {
    /** @type {Map<string, Object>} */
    const map = new Map((remote ?? []).map(t => [t.id, t]));

    for (const op of pending) {
      if (op.pendingOp === 'create' || op.pendingOp === 'update') {
        const existing = map.get(op.id);
        // Accept local change when there's no remote copy, or local is newer
        if (!existing || op.updatedAt >= existing.updatedAt) {
          map.set(op.id, { ...op, synced: true, pendingOp: null });
        }
      } else if (op.pendingOp === 'delete') {
        const existing = map.get(op.id);
        if (existing) {
          // Preserve remote data but stamp deletedAt
          map.set(op.id, {
            ...existing,
            deletedAt: op.deletedAt,
            updatedAt: op.deletedAt,
            synced:    true,
            pendingOp: null,
          });
        } else {
          // Record never existed remotely — still persist the tombstone
          map.set(op.id, { ...op, synced: true, pendingOp: null });
        }
      }
    }

    return Array.from(map.values());
  }

  // ── Sync orchestration ─────────────────────────────────────

  /**
   * Attempt to sync a single month: pull → merge → push.
   * @private
   * @returns {Promise<{ok: boolean, conflict?: boolean, error?: string}>}
   */
  async _syncMonth(store, month, pending) {
    const remote     = await this.pullMonth(month);
    const remoteData = remote?.content ?? [];
    const remoteSha  = remote?.sha     ?? null;

    const merged = this._mergeTransactions(remoteData, pending);
    const result = await this.pushMonth(month, merged, remoteSha);

    if (!result.ok) {
      // GitHub returns 409 Conflict or 422 Unprocessable for SHA mismatches
      const isConflict =
        result.error?.includes('409') ||
        result.error?.toLowerCase().includes('conflict') ||
        result.error?.includes('does not match');
      return { ok: false, error: result.error, conflict: !!isConflict };
    }

    return { ok: true };
  }

  /**
   * Full bidirectional sync.
   * For each month that has pending operations:
   *   1. Pull remote data
   *   2. Merge local pending ops (last-write-wins)
   *   3. Push merged result
   *   4. Mark pending items as synced
   * On SHA conflict: retry once after a fresh pull; set state to 'conflict' on second failure.
   *
   * @param {import('./local-store.js').LocalStore} store
   * @returns {Promise<{ok: boolean, synced?: number, error?: string, conflict?: boolean}>}
   */
  async syncAll(store) {
    try {
      setSyncState('pending');

      const queue = await store.getPendingQueue();
      if (queue.length === 0) {
        setSyncState('synced');
        return { ok: true, synced: 0 };
      }

      // Group pending operations by month — fetch full records from store
      // (queue entries only contain {id, store, op}; full data lives in the store)
      /** @type {Map<string, Object[]>} */
      const byMonth = new Map();
      for (const op of queue) {
        const storeName = op.store || 'transactions';
        const record = await store.get(storeName, op.id);
        if (!record) continue;
        const month = record.date?.slice(0, 7);
        if (!month) continue;
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month).push(record);
      }

      let totalSynced = 0;

      for (const [month, monthPending] of byMonth) {
        // First attempt
        let result = await this._syncMonth(store, month, monthPending);

        // Retry once on conflict (SHA changed between our pull and push)
        if (!result.ok && result.conflict) {
          result = await this._syncMonth(store, month, monthPending);
        }

        if (result.ok) {
          // Commit success: mark records as synced and clear queue entries
          for (const op of monthPending) {
            const record = await store.get('transactions', op.id);
            if (record) {
              record.synced    = true;
              record.pendingOp = null;
              await store.put('transactions', record);
            }
            await store.clearPendingItem(op.id);
          }
          totalSynced += monthPending.length;
        } else if (result.conflict) {
          setSyncState('conflict');
          return { ok: false, error: 'Sync conflict after retry — manual resolution required', conflict: true };
        } else {
          setSyncState('error');
          return { ok: false, error: result.error };
        }
      }

      // Push accounts, categories, budgets — best-effort, never blocks sync result
      await this._pushStaticCollections(store).catch(err => {
        console.warn('[sync] static collections push failed (non-critical):', err.message);
      });

      setLastSync(new Date().toISOString());
      setSyncState('synced');
      return { ok: true, synced: totalSynced };
    } catch (err) {
      setSyncState('error');
      return { ok: false, error: err.message };
    }
  }

  /**
   * Push accounts, categories, and budgets to GitHub.
   * These collections aren't tracked in sync_queue so we push them on every sync.
   * @private
   */
  async _pushStaticCollections(store) {
    const [accounts, categories, budgets] = await Promise.all([
      store.getAccounts(),
      store.getCategories(),
      store.getBudgets(),
    ]);

    const files = [
      { path: 'data/accounts.json',   content: accounts },
      { path: 'data/categories.json', content: categories },
      { path: 'data/budgets.json',    content: budgets },
    ];

    for (const file of files) {
      try {
        const existing = await this.readFile(file.path);
        await this.writeFile(file.path, file.content, existing?.sha ?? null, `Update ${file.path}`);
      } catch (err) {
        console.warn(`[sync] could not push ${file.path}:`, err.message);
      }
    }
  }

  /**
   * Pull ALL remote data into the local store.
   * Used for first-time setup or manual full refresh.
   * Discovers available months from data/transactions/ directory listing.
   *
   * @param {import('./local-store.js').LocalStore} store
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async pullAll(store) {
    try {
      setSyncState('pending');

      // ── Accounts ─────────────────────────────────────────
      const accFile = await this.readFile('data/accounts.json');
      if (accFile?.content?.length) {
        for (const acc of accFile.content) {
          await store.put('accounts', { ...acc, synced: true });
        }
      }

      // ── Categories ────────────────────────────────────────
      const catFile = await this.readFile('data/categories.json');
      if (catFile?.content?.length) {
        for (const cat of catFile.content) {
          await store.put('categories', { ...cat, synced: true });
        }
      }

      // ── Budgets ───────────────────────────────────────────
      const bgtFile = await this.readFile('data/budgets.json');
      if (bgtFile?.content?.length) {
        for (const bgt of bgtFile.content) {
          await store.put('budgets', { ...bgt, synced: true });
        }
      }

      // ── Transactions — discover months via directory listing ──
      const months = await this._listTransactionMonths();
      for (const month of months) {
        const txFile = await this.pullMonth(month);
        if (txFile?.content) {
          for (const tx of txFile.content) {
            await store.put('transactions', { ...tx, synced: true });
          }
        }
      }

      setLastSync(new Date().toISOString());
      setSyncState('synced');
      return { ok: true };
    } catch (err) {
      setSyncState('error');
      return { ok: false, error: err.message };
    }
  }

  /**
   * List available transaction month files by reading the data/transactions/ directory.
   * Falls back to meta.json months list if the directory doesn't exist yet.
   * @private
   * @returns {Promise<string[]>} — YYYY-MM strings
   */
  async _listTransactionMonths() {
    try {
      const { owner, repo, branch } = this._cfg();
      const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/data/transactions?ref=${encodeURIComponent(branch)}`,
        { headers: this._headers() }
      );

      if (res.status === 404) {
        // Directory not created yet — fall back to meta.json
        const meta = await this.readFile('data/meta.json');
        return meta?.content?.months ?? [];
      }

      if (!res.ok) return [];

      const files = await res.json();
      // Filter to files matching YYYY-MM.json pattern
      return files
        .filter(f => f.type === 'file' && /^\d{4}-\d{2}\.json$/.test(f.name))
        .map(f => f.name.replace('.json', ''));
    } catch {
      return [];
    }
  }
}
