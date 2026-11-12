# PennyWise — project brief

Status: first release implemented in the nested PennyWise repository. Financial tests, the production build, and isolated Chrome browser checks pass. Hosted deployment is pending.

## Purpose

Help people understand and manage their finances. The broader vision covers tracking, budgeting, cash flow, debt, savings, unexpected expenses, financial planning and education, spending habits, shared finances, and irregular income.

## First release decisions

- Focus on everyday money control: manually record income and expenses, manage monthly budgets, and see upcoming bills.
- Build an installable, offline-capable web app that works on phones and desktops.
- Keep records in the current browser, without accounts or cloud sync. Include backup export and restore.
- Use Philippine pesos (PHP).
- Support separate cash, bank, and e-wallet accounts, with transfers between accounts.
- Show upcoming and overdue bills inside the app; no background notifications.
- Use the Daily Companion dashboard, with a prominent transaction action, upcoming bills, and budget progress.
- When a user marks a bill as paid, automatically create an expense transaction. The user chooses the account and confirms the amount.
- Combine backup records by stable ID, with a preview and explicit conflict choices. Missing backup records do not delete current records. Older backups can restore previously deleted records as previewed additions.

## Implementation decisions

- Use React, TypeScript, Vite, and Dexie with a private local IndexedDB database.
- Use monthly category budgets without rollover, opening account balances, and one-time or monthly bill schedules.
- Store money as integer centavos. Derive balances from transactions. Record transfers as one entry.
- One finance module owns writes. Each committed change advances a revision. Reject import previews if records changed in another tab.
- Prompt before app updates and require explicit reload in each tab, preserving open forms.
- Start with an empty financial journal and a small default category set.

## Verification and release limits

- 25 finance tests cover money, transfers, recurrence, payment uniqueness, merge conflicts, and rollback on storage failure.
- Browser checks cover daily workflows, backup combining, cross-tab conflicts, offline reopening, and updates with unsaved input.
- Independent code review findings were fixed. A visual review requested stronger contrast for small text.
- Chrome was exercised locally. Safari, physical phone installation, future schema migrations, and hosted CI have not been verified.
- Use a stable HTTPS origin before entering real records. A different website address has separate browser storage.

## Later possibilities

Debt payoff tools, savings and long-term planning, shared accounts, automatic bank connections, financial education, and specialized irregular-income planning are part of the broader vision but not the first-release focus.

## Data consideration

Browser data is device-specific and can be lost when browser storage is cleared. Backups need to be kept somewhere safe by the user.
