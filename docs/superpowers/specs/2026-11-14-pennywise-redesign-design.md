# PennyWise redesign — proposed design, 14 November 2026

## Intent and approved approach
Deliver the full requested finance workspace: immediate financial clarity, fast transaction logging, calm alerts, and a native-feeling phone layout. The user selected retaining Vite and implementing the full redesign with Tailwind. Preserve React, TypeScript, Dexie, offline installation, existing accounts, bills, transfers, validation, and merge-based backups.

Approaches considered: retaining Vite avoids an unnecessary platform migration while replacing the presentation; migrating to Next.js adds routing, deployment, and offline migration work without a required server feature. Retaining the existing CSS would be smaller but conflicts with the explicit Tailwind requirement. Retain Vite and adopt Tailwind.

## Visual system and layout
Operate mode. Replace the blue visual world with restrained fintech surfaces: light #F8FAFC / white and dark #09090B / #18181B, one-pixel borders, clear hierarchy, Inter body text and JetBrains Mono numeric figures with tabular numerals. Self-host fonts. Emerald, amber, and rose denote healthy, approaching, and exceeded limits; use readable foreground variants and text labels alongside color. Category badges pair muted colors with icons. Avoid invented financial trends and sample balances.

Desktop: collapsible left navigation, page title/date and persistent Log transaction action, dense but readable workspace. Phone: four destinations around a central plus action; a More destination exposes every remaining screen. Keep safe-area padding and 44px touch targets. Transactions use a right drawer on desktop and accessible full-height sheet on phones. Respect reduced motion and visible keyboard focus; trap dialog focus and restore it on close.

Overview sketch:
[Month selector                              + Log transaction]
[Balance / trend] [Income] [Expenses / net flow] [Remaining / Safe to spend]
[Spending versus target, weekly bars         ][Category donut + legend]
[Budget health, up to four categories        ][Upcoming bills          ]
[Recent transactions: search / category filter                       ]

## Financial definitions (builder proposals)
All money remains integer minor units. Balance means all account balances, including archived accounts with remaining funds. Current-month income and expenses exclude transfers. Net cash flow is income minus expenses. Compare balance at the selected month end (today for the current month) with the previous month end; show no percentage when the prior balance is zero or negative. Historical totals exclude future-dated transactions.

Remaining budget equals total selected-month category limits minus ALL selected-month expenses, including unbudgeted categories, which must be visibly identified. With no budgets show Set a budget, not a fictional zero allowance.

Safe-to-spend is an estimate for the current month: max(0, min(remaining monthly budget, current cash balance minus unpaid bills due on or before month end minus savings reservations)). Overdue unpaid bills are included; future-dated entries are excluded. Show the exact calculation in an accessible explanation. Do not subtract bill amounts twice from the budget side; expenses already include paid bills. Without configured budgets, show Not calculated with a Set budget CTA. Historical months show remaining budget rather than an actionable safe-to-spend figure. This is a planning estimate, not a guarantee of bank funds.

## Screens and interactions
- Dashboard: four KPI cards, explicit net-flow figure, weekly actual/target chart with keyboard-accessible values, donut and toggleable category legend, top four budget health rows, upcoming bills, recent searchable/filterable activity. Empty states guide account creation and entry; no fake analytics.
- Quick add: persistent plus and N shortcut outside editable fields; expense/income segments; amount focused first, category chips, account defaulting to last successfully used active account, today, optional note. Save with keyboard. Require account selection when no valid default exists; retain values on validation failure and guard accidental dirty dismissal. Existing transfer and edit flows remain reachable.
- Budgets: category cards show spent/limit/remaining, progress, alert threshold. Default amber threshold 80%; rose at 100% or over. Permit threshold 1–99%, validated and persisted per budget. Disable optional near-limit alerts through preferences; always display exact totals and over-limit status. No push notification promise.
- Savings: CRUD goals with target, contribution history, progress, Add funds and release funds. Deposits reserve existing available money for a goal; they do not create income or expenses and do not move bank money. Validate sufficient unreserved current funds for deposits, positive integer amounts, release at most the reserved amount, and prevent deletion of funded goals until funds are released. Existing transactions may later reduce cash below reservations: display an underfunding warning rather than silently changing records. No account linking in this release.
- Reports: inclusive date range, type and category filters, totals and breakdown table, export matching records as CSV and PDF. Escape CSV cells against formula execution and quote correctly. PDF export uses a focused printable report with browser Save as PDF; label the dialog expectation. Exclude transfers from income/expense totals; show transfers separately in All. Maintain exact centavo calculations and empty export behavior.
- Preferences: local profile name, PHP or USD default ledger currency, theme Light/Dark/System, in-app alert toggles, existing category management, backup tools and offline status. This remains a local profile with no account authentication. Currency is one ledger denomination, not conversion or a multi-currency wallet. Existing ledgers remain PHP; changing denomination is disabled while any monetary records exist, with a clear explanation. Never silently relabel existing pesos as dollars. No cloud, exchange rates, or push alerts.
- Preserve full accounts, transfers, bills, mark-paid expense creation and idempotency, backup conflict preview, and update prompts in the new shell.

## Data and engineering
Presentation uses modular typed React components and Tailwind utility classes, with only Tailwind setup and necessary font declarations in CSS. Separate analytics selectors, export functions, and financial commands from UI. Prefer installed Lucide icons and simple accessible SVG charts over adding chart dependencies.

Add savings goals, contribution records, preferences, and budget thresholds through a versioned Dexie upgrade and versioned backup format. Existing databases and version-one backups must remain readable, preserving every existing record and stable identifier. New-format backups include all new records and settings; old backup imports do not reset new settings or delete new records. Validate complete merged graphs atomically, maintain revision guards and explicit conflicts, and extend transactional persistence to the new tables. Defaults for old budgets are 80%. New tabs or old app versions encountering a schema upgrade must prompt to reload and must not continue incompatible writes. Advise exporting a backup before first upgrade.

No backend, signup, Next.js migration, bank connections, tax guidance, debt planner, or currency conversion. Do not publish or push during design approval; implementation verification precedes any later release request.

## Validation and completion
Tests cover safe-to-spend including overdue/paid bills and savings, exact arithmetic, thresholds, contributions and releases, database/backup migration, merge conflicts, CSV escaping and filtered reports. Run the existing finance suite, TypeScript/build checks, and production browser scenarios, extending them for quick add, goals, filters/export, theme persistence and keyboard navigation. Inspect desktop and phone screenshots in both themes and one populated and empty state. Use no production financial data in QA. A physical iPhone remains unverified unless actually tested.

## Decisions left to builder
Component boundaries, Tailwind version compatible with installed Vite, precise spacing, icon mapping, bar aggregation for short date ranges, storage representation of contribution records, and responsive breakpoints. Match semantic behavior above and preserve existing data safety.
