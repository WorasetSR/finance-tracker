# Finance Tracker v2 — Idea & Product Spec
Date: 2026-06-16
Architecture: Static app + GitHub-backed sync
Status: Updated after architecture review

---

## Goal

Build a single-user personal finance tracker that is fast to enter data, easy to maintain, and portable across devices without running a traditional database.

Core jobs:
- Add income, expense, and transfer records quickly.
- See account balances by account.
- Track monthly category budgets.
- Review monthly and yearly spending trends.
- Export records to Excel.
- Use the same data on phone and desktop through GitHub-backed sync.

Primary principle: GitHub is the remote sync and backup layer, not the interactive runtime database. The app should remain useful even when offline, and it should not depend on a deployment cycle after each transaction.

---

## Recommended Architecture

```
Static app on Vercel / GitHub Pages
        ↓
Browser local store (IndexedDB preferred, localStorage acceptable for MVP)
        ↓
Manual sync queue
        ↓
GitHub Contents API
        ↓
JSON files in a private GitHub repository
```

Important change from the first idea:
- Do not wait for GitHub Actions or Vercel redeploys for transaction data to appear.
- The deployed site should be a static shell.
- At app startup and manual sync, the browser reads/writes JSON data through the GitHub API.
- GitHub Actions are optional for validation/export/report generation, not required for normal sync.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla JS + CSS | No build step, simple deployment, easy maintenance |
| Local Store | IndexedDB preferred; localStorage acceptable for MVP | Offline-first data entry and pending sync queue |
| Remote Store | Private GitHub repo with JSON files | Free, portable, full version history |
| Sync API | GitHub Contents API | Simple read/write for JSON files |
| Deploy | Vercel or GitHub Pages | Static hosting only |
| Charts | Chart.js | Lightweight CDN-friendly charts |
| Export | SheetJS | Excel export |
| Auth | No app auth; user-provided GitHub token | Single-user app, token lives only on the user's device |

Removed from v2:
- Supabase
- Firebase
- server database
- committed app secrets
- deployment-triggered data refresh as the main sync mechanism

---

## Security Decisions

### Do Not Commit GitHub Tokens

Never store a GitHub Personal Access Token in `config.js` or any committed file. Browser JavaScript is visible to the user and anyone who can load the app bundle. A committed token should be treated as leaked.

Recommended MVP approach:
- First-run setup screen asks for:
  - GitHub owner
  - repository name
  - branch
  - fine-grained Personal Access Token
- Store the token only in the browser's local storage.
- Provide a "Forget token" button.
- Document that the token must be fine-grained and limited to the finance tracker repository.

Safer future approach:
- Add a small Vercel serverless sync proxy.
- Store the GitHub token as a Vercel environment variable.
- Browser calls the proxy instead of GitHub directly.
- This adds backend maintenance, so it is not required for MVP unless token exposure is unacceptable.

---

## UX Pattern: Offline-First + Manual Sync

User flow:

```
Add transaction
        ↓
Save immediately to local store
        ↓
Append operation to pending sync queue
        ↓
User presses "Sync"
        ↓
App pulls latest remote files from GitHub
        ↓
App merges pending local operations
        ↓
App writes updated JSON files with GitHub file SHA check
        ↓
Local state is marked synced
```

Sync button states:

```
[Synced]
[Sync 3 pending]
[Syncing...]
[Conflict - Review]
[Sync failed - Retry]
```

Required sync UX:
- Always show pending count.
- Show last successful sync time.
- Show unsynced changes in a small review screen.
- Allow retry after failure without losing local edits.
- Never claim "synced" until GitHub write succeeds.

---

## Sync Conflict Model

GitHub file writes require the current file `sha`. Use that as the conflict guard.

Basic algorithm:

1. Load local working copy and pending operation queue.
2. Fetch latest remote file content and `sha`.
3. Apply pending operations on top of latest remote data.
4. Write file back with the fetched `sha`.
5. If GitHub rejects the write because the file changed, refetch and retry merge.
6. If automatic merge fails, show "Conflict - Review" and keep local pending operations untouched.

Data safety rules:
- Every record has stable `id`, `createdAt`, `updatedAt`, and `clientId`.
- Deletes are soft deletes with `deletedAt`, not immediate hard deletes.
- Last-write-wins is acceptable for simple edits, but transaction deletes should remain recoverable.
- Pending operations should be idempotent so retrying sync does not duplicate records.

---

## Data Storage

Use monthly transaction files to keep sync fast and reduce conflict scope.

```
data/
  accounts.json
  categories.json
  budgets.json
  transactions/
    2026-06.json
    2026-07.json
  meta.json
```

### Transaction Format

```json
{
  "id": "tx_20260616_103000_ab12",
  "type": "expense",
  "amountMinor": 25000,
  "currency": "THB",
  "date": "2026-06-16",
  "note": "Lunch",
  "accountId": "acc_cash",
  "categoryId": "cat_food",
  "transferId": null,
  "createdAt": "2026-06-16T10:00:00Z",
  "updatedAt": "2026-06-16T10:00:00Z",
  "deletedAt": null,
  "clientId": "client_phone_01"
}
```

Notes:
- Store money as integer minor units (`amountMinor`) to avoid floating point rounding bugs.
- Use `currency` even if MVP only supports THB, so future multi-currency support is easier.
- Transfers can be represented as one transfer transaction with `fromAccountId` and `toAccountId`, or as two linked records with the same `transferId`. Choose one model before implementation.

### Account Format

```json
{
  "id": "acc_cash",
  "name": "Cash",
  "icon": "wallet",
  "currency": "THB",
  "initialBalanceMinor": 0,
  "archivedAt": null,
  "createdAt": "2026-06-16T10:00:00Z",
  "updatedAt": "2026-06-16T10:00:00Z"
}
```

### Budget Format

Budgets should be separate from categories because a budget is month-specific.

```json
{
  "id": "budget_2026_06_food",
  "month": "2026-06",
  "categoryId": "cat_food",
  "limitMinor": 1200000,
  "currency": "THB",
  "createdAt": "2026-06-16T10:00:00Z",
  "updatedAt": "2026-06-16T10:00:00Z"
}
```

---

## Pages & Features

### 1. Dashboard

- Month navigation.
- Income, expense, net cashflow, and saving rate for the selected month.
- Account balances by account.
- Top spending categories donut chart.
- Latest 5-10 transactions.
- Sync status and pending count visible from the main screen.
- Privacy mode toggle to hide amounts in public.

### 2. Transactions

- Group transactions by day.
- Filters: month, category, account, type, synced/unsynced.
- Add, edit, soft delete, and undo.
- Support income, expense, and transfer.
- Quick-add layout optimized for mobile.
- Export filtered results to Excel.

### 3. Budget

- Monthly budget by category.
- Progress bars with spent amount, remaining amount, and percentage.
- Alert states: near limit, over limit.
- Copy last month's budget into current month.

### 4. Analytics

- Monthly income vs expense bar chart.
- Category spending breakdown.
- Saving rate trend.
- Account balance trend.
- Optional: rolling 3-month average to smooth noisy spending.

### 5. Accounts & Categories

- CRUD accounts.
- Archive accounts instead of deleting when used by past transactions.
- CRUD categories.
- Archive categories instead of deleting when used by past transactions.
- Seed sensible defaults on first run.

### 6. Settings

- Configure GitHub owner/repo/branch/token.
- Test GitHub connection.
- Forget token.
- Export all local data.
- Import backup JSON.
- Clear local cache after confirmation.

---

## File Structure

```
finance-tracker/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── settings.js          # local-only GitHub repo/token settings
│   ├── local-store.js       # IndexedDB/localStorage data layer
│   ├── sync.js              # GitHub API + merge/retry logic
│   ├── schema.js            # validation helpers
│   ├── format.js
│   ├── export.js
│   └── pages/
│       ├── dashboard.js
│       ├── transactions.js
│       ├── budget.js
│       ├── analytics.js
│       └── accounts.js
├── data/
│   ├── accounts.json
│   ├── categories.json
│   ├── budgets.json
│   ├── meta.json
│   └── transactions/
│       └── 2026-06.json
└── SETUP.md
```

Optional later:

```
.github/
  workflows/
    validate-data.yml
    scheduled-recurring-transactions.yml
```

---

## GitHub Actions Role

GitHub Actions should not be required for basic data sync.

Good uses:
- Validate JSON files after push.
- Generate periodic reports.
- Run scheduled recurring transactions if that feature is added.
- Create downloadable backups.

Avoid:
- Rebuilding the dashboard after every transaction.
- Using deploy completion as the signal that data is synced.

---

## MVP Scope

Build first:
- First-run GitHub setup screen.
- Local transaction CRUD.
- Accounts and categories.
- Monthly transaction file sync.
- Conflict-safe manual sync.
- Dashboard.
- Budget page.
- Export to Excel.

Defer:
- Recurring transactions.
- Bank statement import.
- Multi-currency conversion.
- Mobile shortcut integrations.
- Serverless sync proxy.
- Advanced analytics.

---

## Open Decisions Before Build

1. Local storage engine: IndexedDB or localStorage for MVP.
2. Transfer model: one record with `fromAccountId`/`toAccountId`, or two linked records.
3. Hosting: Vercel or GitHub Pages.
4. Token handling: local browser token for MVP, or serverless sync proxy from day one.
5. Initial currency: THB only with currency fields included, or true multi-currency from the start.

Recommended defaults:
- IndexedDB if implementation time allows; otherwise localStorage for MVP.
- One transfer record with `fromAccountId` and `toAccountId`.
- Vercel for app hosting.
- Browser-stored fine-grained token for MVP.
- THB only in UI, but keep `currency` fields in the data model.

---

## v2 Nice-to-Haves

- PWA install support.
- Dark mode.
- Recurring transactions through scheduled GitHub Action.
- CSV bank statement import.
- Category matching rules for imports.
- iOS Shortcut / Android Tasker quick-add.
- Serverless sync proxy for stronger token protection.
- Data validation workflow in GitHub Actions.
