# PennyWise Redesign Implementation Plan

> For agentic workers: execute task by task with independent review after implementation.

Goal: implement the approved full fintech redesign while preserving local records and offline operation.
Architecture: retain Vite/React/Dexie. Finance owns validated atomic commands and versioned backups; pure selectors own analytics and reports; Tailwind components own presentation.
Tech stack: React, TypeScript, Vite, Dexie, Tailwind, Lucide, Vitest, Playwright.
Spec: docs/superpowers/specs/2026-11-14-pennywise-redesign-design.md

## Global constraints
Integer minor units; no silent currency conversion; no cloud or signup. Preserve accounts, categories, bills, transfers, explicit import conflicts, dirty forms, and per-tab PWA reload. No pushing or deployment in this task.

## Review focus
Old databases and v1 imports preserve IDs and new records; savings never invent income; future entries cannot inflate available cash; unavailable budgets show no allowance; mobile keyboard and sheets leave every action reachable.

## Task 1: Safe data extensions
Files: src/finance/types.ts, storage.ts, validation.ts, index.ts, rules.ts as needed; src/finance/finance.test.ts.
Interfaces: Snapshot gains goals, contributions, preferences collections; budget gains optional alertThreshold default 80. finance adds saveGoal, deleteGoal, contribute, savePreferences. Preferences singleton has id preferences, name, currency PHP|USD, theme light|dark|system, alerts boolean. Goal id/name/target; Contribution id/goalId/amount signed/date; contribute takes goalId/amount signed/date, refuses insufficient unreserved funds or excessive releases. Existing APIs remain stable.
- [x] Add behavioral tests for deposits/releases, denomination guard, v1/v2 backup merging and schema upgrade.
- [x] Implement Dexie v2 tables and backward compatible parsing, atomic graph validation and persistence. Export v2 backups. Preserve explicit conflicts and stale-preview rejection.
- [x] Run finance tests and TypeScript; commit only owned files.

## Task 2: Analytics and exports
Files: src/finance/analytics.ts, analytics.test.ts, src/reports.ts, reports.test.ts.
Interfaces: deriveDashboard(snapshot, month, asOf) returns balance, priorBalance, income, expenses, net, budgetLimit, remaining nullable, reserved, unpaidBills, safeToSpend nullable, category totals, weekly actual/target. filterTransactions(snapshot, {from,to,kind,categoryId}); buildCsv(snapshot, transactions, currency) returns string; printReport opens accessible printable report from filtered rows.
- [x] Test overdue/paid bills, future dates, no budget, reservations, archived balances, exact totals and CSV injection.
- [x] Implement pure selectors and safe exports with explicit filtered inputs.
- [x] Run targeted tests; commit only owned files.

## Task 3: Fintech interface
Files: src/App.tsx, src/components/*, src/styles.css, src/type.css, main.tsx, package files, vite config, public fonts, scripts/browser-check.mjs.
- [x] Add Tailwind Vite integration and self-hosted Inter/JetBrains Mono.
- [x] Replace presentation with reusable panels, numeric amounts, badges, progress, sheets and navigation; preserve all existing financial actions.
- [x] Implement overview, quick add N shortcut and last active account, budgets/threshold, goals/deposits, reports/CSV/print PDF, local profile/theme/currency, bills/accounts/backups/offline state.
- [x] Capture desktop/phone, populated/empty and light/dark; extend browser checks for new workflows and keyboard behavior. Run npm run check and browser checks.

## Task 4: Review and documentation
- [x] Independently inspect migration/data safety and screenshots; fix material findings, rerun relevant checks.
- [x] Update PRODUCT.md, DESIGN.md and .impeccable design tokens/surface to match implemented behavior and report actual limits.


## Completion evidence

Implemented on codex/fintech-redesign. The integrated check passes 45 tests and the production build; the production Chrome suite passes 15 checks with zero page errors. TypeScript no-unused checks pass. Runtime dependencies have no reported npm audit advisories (development-tool advisories remain outside this redesign).

A generic independent reviewer substituted for the unavailable named Impeccable reviewer. The confirmation verdict is ship at its scoped screenshot-review level: all three findings (phone KPI visibility, unavailable metric wrapping, and category legend layout) resolved. Required captures cover light/dark desktop/phone overviews, empty desktop, and phone budgets, savings, reports, settings and quick add. Evidence: output/playwright/results.json and screenshots, copied into .impeccable/review. The engine/detector was unavailable, so no detector result is claimed.

No physical iPhone, real print-to-file dialog, 200% text enlargement or hosted release was verified. PDF output uses browser Save as PDF. Existing installed v1 app code cannot be retroactively schema-guarded; export backup and close old app tabs before first upgrade. No push or deployment performed.
