# PennyWise implementation reference

PennyWise retains React, TypeScript, Vite, Dexie, and an offline PWA shell. The redesigned presentation uses Tailwind utilities and self-hosted Inter and JetBrains Mono. Financial records remain local to one browser origin.

## Ownership and records

The finance module owns validation, atomic commands, database revisions, and backup merging. Screens read committed snapshots and hold unsaved input. Pure analytics selectors derive summaries; report functions receive explicitly filtered records. The service worker caches application files only.

Schema version 2 contains accounts, categories, transactions, budgets, bills, goals, contributions, singleton preferences, and revision metadata. Transfers remain one transaction linking two accounts. Bill payments retain their scheduled occurrence identity and create one linked expense.

Goals contain a name and target. Contributions contain a goal ID, signed integer amount, and calendar date. Deposits require sufficient unreserved current funds. Releases cannot exceed the goal reservation. Contributions cannot be future-dated, including through backup import. Deleting a funded goal is blocked; deleting a released goal removes its contribution history atomically. Later spending can underfund existing reservations without rewriting that history.

Preferences contain a local name, one PHP/USD denomination, light/dark/system theme, and an in-app alert toggle. Currency changes are blocked while monetary records exist. There is no conversion. Budget alert thresholds default to 80 and accept whole percentages from 1 to 99. Over-limit figures remain visible when optional near-limit alerts are disabled.

## Financial definitions

Amounts use integer minor units and checked aggregate sums. Dates are calendar strings; today follows Asia/Manila. Balance includes all account balances, including archived accounts, using transactions through the selected cutoff. The current month stops at today; historical months stop at month end. Income and expense totals exclude transfers. Net cash flow is income minus expenses. The prior-balance comparison uses the previous month end and suppresses percentages for a nonpositive prior balance.

Remaining budget is the sum of selected-month category limits minus all selected-month expenses, including categories without budgets. Without any budgets, remaining allowance is unavailable.

For the current month, safe-to-spend equals max(0, min(remaining budget, current cash minus unpaid bills through month end minus savings reservations)). Unpaid bills include overdue occurrences. Future-dated payments do not settle a bill before their payment date. Paid expenses already consume budgets, so bills are not subtracted again from the budget side. Historical months show remaining budget rather than actionable safe-to-spend. The result is an estimate, not a guarantee of bank funds.

Reports use inclusive dates, type, and category filters. Transfers appear separately in All and are excluded from income/expense totals. CSV cells are quoted and protected against spreadsheet formula execution. PDF export opens a focused printable report and relies on the browser Save as PDF dialog.

## Migration and backup compatibility

The version-one database upgrade preserves existing records and identifiers, defaults old budget thresholds to 80, and adds default PHP preferences and empty savings tables. Upgrade writes run in one Dexie transaction. Export a backup before first upgrade and close/update old tabs.

Version-two backups include all extension records and settings. Version-one PHP imports remain supported and preserve newer local settings and records. Imports match stable IDs, skip identical records, and require choices for changed IDs or unique business-key conflicts. Missing records never delete current records. Old backups may restore deleted records as previewed additions.

Every changed financial write advances a persisted revision. Import previews capture it; commit rejects a stale preview. The resolved graph is validated and committed atomically. Exports read a consistent snapshot. Currency mismatch cannot silently relabel existing records.

Current clients close database connections after an external upgrade and reject unsupported future schemas on reopening. Already-installed version-one bundles cannot retroactively gain this guard. No recovery path deletes the database.

## Verification and release state

The integrated suite passes 45 tests and the production build. Tests include exact money, transfers, bill uniqueness, thresholds, deposits/releases, denomination guards, version-one/version-two backups, stale imports, actual schema migration, migration rollback, unsupported future schemas, analytics, and CSV escaping.

The latest production browser run passes 15 checks with zero page errors. It covers quick entry and keyboard access, budgets, reservations, bill expenses, reports and printable PDF, backup handling, custom categories, theme persistence, desktop/phone layouts in both themes, cross-tab update safety, and offline reopening. Evidence is in output/playwright/results.json and its screenshots. Three finish-review visual fixes were applied and recaptured; the scoped screenshot confirmation returned ship with all three findings resolved.

The existing hosted origin is https://pennywise-pi.vercel.app. This redesign has not been deployed. Physical iPhone/Android installation, Safari, future migration implementations, and hosted CI were not verified. A stable HTTPS root origin is required for installation and continued access to the same local records.
