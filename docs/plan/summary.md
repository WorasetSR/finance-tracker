# Finance Tracker — Project Status Summary
Date: 2026-06-16
Status: v2 plan updated after architecture review

---

## What Was Built in v1

Stack:
- Frontend: Vanilla JS ES modules + custom CSS.
- Auth: Supabase Google OAuth (`auth.js`).
- Database: Supabase PostgreSQL (`db.js`).
- Charts: Chart.js 4.4.
- Export: SheetJS to `.xlsx`.
- Deployment files: Firebase Hosting files are present but no longer match the Supabase path.

Completed pages:

| Page | File | Status |
|---|---|---|
| Dashboard | `pages/dashboard.js` | Built: income/expense summary, account balances, donut chart, month navigation |
| Transactions | `pages/transactions.js` | Built: CRUD, date/category filters |
| Budget | `pages/budget.js` | Built: category limits, progress bars |
| Analytics | `pages/analytics.js` | Built: monthly bar chart, category pie chart |
| Accounts & Categories | `pages/accounts.js` | Built: CRUD and seed defaults |

Other files:
- `db.js`: in-memory cache layer, fetches all data on login, visibility sync.
- `auth.js`: Supabase Google OAuth redirect flow.
- `format.js`: date and number formatters.
- `export.js`: SheetJS export.

---

## Current v1 Blockers

1. `config.js` is empty, so the app cannot connect to Supabase.
2. Firebase and Supabase setup are mixed:
   - Code uses Supabase.
   - Setup docs still mention Firebase.
   - Firebase config files remain in the app.
3. No committed SQL schema exists.
4. No documented Supabase RLS rules exist.
5. A previous Firebase-oriented server-side write verification change may conflict with the current Supabase direction.

Conclusion: v1 has useful UI and feature work, but the backend/deployment foundation is inconsistent enough that a clean v2 is preferable.

---

## v2 Direction

The v2 direction is still to remove Supabase/Firebase and use a simpler static app. However, the reviewed architecture is now more precise:

Use GitHub as the remote sync and backup layer, not as a live runtime database that depends on redeploying after each transaction.

Recommended v2 architecture:

```
Static app
  -> local browser store
  -> pending sync queue
  -> GitHub Contents API
  -> JSON files in a private GitHub repository
```

Key corrections from the first v2 idea:
- Do not store GitHub PAT in committed `config.js`.
- Do not rely on GitHub Actions + Vercel redeploy for normal data refresh.
- Do use GitHub file `sha` checks to avoid overwriting remote changes.
- Do split transaction data by month to reduce conflicts and file size.
- Do keep soft deletes and stable IDs so sync retries are safe.

Full updated spec: `idea.md`.

---

## Updated MVP Recommendation

Build these first:
- First-run settings screen for GitHub owner, repo, branch, and fine-grained token.
- Token stored only on the user's device.
- Local transaction CRUD with offline support.
- Manual sync with pending queue.
- GitHub read/write with file `sha` conflict protection.
- Monthly transaction files under `data/transactions/YYYY-MM.json`.
- Accounts, categories, and monthly budgets.
- Dashboard, transaction list, budget page, analytics basics.
- Excel export.

Defer:
- Recurring transactions.
- Bank statement import.
- Serverless sync proxy.
- Full multi-currency conversion.
- Advanced analytics.
- Mobile shortcut integrations.

---

## Main Risks to Handle Before Build

### 1. Token Security

Risk: A GitHub token committed into app source is effectively leaked.

Decision: No committed token. The token is entered on first run and stored locally on the user's device. A future serverless sync proxy can improve security further.

### 2. Sync Conflict

Risk: Phone and desktop can overwrite each other if both sync from stale data.

Decision: Sync must fetch the latest GitHub file and `sha`, merge pending local operations, then write with the current `sha`. If the write is rejected, refetch and retry.

### 3. Data Growth

Risk: One large `transactions.json` file becomes slow and conflict-prone.

Decision: Store transactions by month:

```
data/transactions/2026-06.json
data/transactions/2026-07.json
```

### 4. User Trust

Risk: The app says data is saved when only local state changed.

Decision: UI must distinguish:
- saved locally
- pending sync
- syncing
- synced to GitHub
- sync failed
- conflict needs review

---

## Implementation Gate

Before coding, decide:

1. IndexedDB vs localStorage for MVP.
2. Transfer data model.
3. Vercel vs GitHub Pages.
4. Browser-stored token vs serverless sync proxy.
5. THB-only UI vs true multi-currency.

Recommended defaults:
- IndexedDB if time allows; localStorage if speed matters more.
- One transfer record with `fromAccountId` and `toAccountId`.
- Vercel for hosting.
- Browser-stored fine-grained token for MVP.
- THB-only UI with `currency` fields in the data model.
