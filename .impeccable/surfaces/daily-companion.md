# Daily Companion

Mode: Operate. Give users a clear view of their money and a short path to logging the next transaction.

## Direction contract

Use the approved neutral light/dark finance workspace, Inter text, JetBrains Mono amounts, one-pixel separators, and semantic emerald/amber/rose statuses. Implement presentation with Tailwind utilities. Preserve the local React/Vite/Dexie PWA architecture.

The first viewport exposes the selected month, the transaction action, and four KPI areas. Balance comparisons exclude future entries. The current month can show safe-to-spend with an accessible calculation; other months show remaining budget. A missing budget produces no fictional allowance.

Desktop uses a collapsible rail. Phones use two-column KPI areas and fixed bottom navigation with a central add action. More exposes Savings, Reports, Accounts, Bills, and Preferences as needed. The donut legend moves below the chart on phones.

Charts use actual records with keyboard-readable values. Budget rows show exact spent/limit/remaining figures, with configurable near-limit alerts. Upcoming bills retain overdue occurrences and ignore future-dated payments until their payment date.

Transaction entry uses an accessible drawer or full-height sheet. Keep account, transfer, category, bill, backup conflict, and update actions reachable. Preserve dirty input when another tab activates an app update.

## Review evidence

The latest production browser run passes 15 checks with zero page errors. Desktop, phone, populated, empty, and light/dark evidence is in output/playwright. Three finish-review fixes were applied and recaptured. Scoped screenshot confirmation returned ship with all three findings resolved. Screenshots use synthetic records. No redesign deployment is claimed.
