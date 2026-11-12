# PennyWise implementation

The reviewed architecture is the implementation contract. This app uses a local IndexedDB database and a static PWA shell. Financial records stay in the browser.

## Work sequence

1. Define the account, category, transaction, budget, and bill records. Prepare the test runner.
2. Implement one owner for financial writes. Verify exact money, transfers, recurrence, and bill payment uniqueness.
3. Implement validated backup combining. Reject stale previews and commit resolved imports atomically.
4. Connect the Daily Companion screens. Add accounts, activity, budgets, bills, and backup settings.
5. Verify the production build, browser workflows, offline reopening, and accessible phone and desktop layouts.

## Safety decisions

Balances are derived from opening balances and transactions. Every financial write advances the database revision. Import previews capture that revision and become invalid after any further write.

Backups combine records by ID. Missing records do not remove current records. An old backup can restore a previously deleted record after the user reviews the additions. Conflicts require an explicit choice.

Amounts are integer centavos. Date-only strings use the Philippine calendar. Existing payments keep their bill occurrence identity.

## Boundaries

The finance module owns storage, input validation, atomic commands, and backup merging. Screens read committed snapshots and hold unsaved form input. The service worker caches application files only.

## Completion checks

Run `npm run check` and `npm run test:browser`. Browser evidence belongs in `output/playwright`. No cloud sync, bank connection, or automatic background bill notification is included.

## Verification scope

The finance suite contains 25 behavioral tests. The production browser check covers account setup, income, expenses, transfers, budgets, bill payment, edits, backup combining, malformed JSON, stale cross-tab previews, offline reopening, and cross-tab updates with unsaved input.

Independent code review found a backup merge loss case when budget keys swap. The regression failed before the resolver fix and passes afterward. Accepted imported records are now inserted after original-record removals, and conflicting keep-current choices abort.

The first live browser run also exposed ambiguous select labels and assertions running before reactive updates. Account fields now have explicit accessible names. Browser assertions wait for the committed amounts.

The visual review requested higher contrast for panel descriptions, footer text, and inactive phone navigation. Those reviewed labels now use the shared secondary-text color.

Only local Chrome has been exercised. Physical installation on iOS and Android, Safari, future schema migrations, and hosted CI remain unverified. The app requires a stable HTTPS origin before release to real users.
