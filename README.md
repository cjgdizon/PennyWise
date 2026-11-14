# PennyWise

PennyWise is a personal finance PWA with manual transactions, accounts, transfers, category budgets, bills, savings reservations, and filtered reports. Records stay in the current browser. The app has no signup or cloud recovery.

The current hosted origin is [PennyWise](https://pennywise-pi.vercel.app). This repository contains a newer local redesign that has not been deployed to that origin.

## Run locally

Install Node.js 22.12 or later. Run these commands in this folder:

~~~sh
npm ci
npm run dev
~~~

Open the address Vite prints. Add an account and its opening balance to start. No sample financial records are added to the journal.

## Verify a production build

~~~sh
npm run check
npm run test:browser
~~~

The integrated suite currently passes 45 tests and the production build. The latest browser run passes 15 checks with zero page errors. The scoped screenshot confirmation returned ship: all three findings were resolved.

The browser check starts a production preview on port 4173 and uses isolated contexts with synthetic records. On Windows it uses installed Google Chrome. On other systems, install Chromium with npx playwright install chromium first. Evidence is written to output/playwright.

## Use PennyWise offline

~~~sh
npm run build
npm run preview -- --port 4173
~~~

Open the production preview online once and wait for its offline-ready status before disconnecting. Installation depends on the browser. Use Install or Add to Home Screen when available. Production hosting requires a stable HTTPS origin at the root path. Changing the origin creates a separate browser database.

## Understand the money records

Amounts use integer minor units. Each ledger uses either PHP or USD. Changing denomination is blocked while monetary records exist, and no currency conversion takes place. Existing ledgers remain PHP.

Recording a bill payment creates an expense; it does not pay the provider. Savings contributions reserve existing funds without creating income, expenses, or transfers. Release reserved funds before deleting a funded goal.

Safe-to-spend is a current-month planning estimate. It takes the lower of remaining budget and cash after unpaid bills and savings reservations, with a floor of zero. It includes overdue bills and excludes future-dated transactions. With no budgets, it is not calculated.

Reports export the records matching their filters. The PDF action opens a printable report and the browser print dialog; choose Save as PDF there.

## Keep and combine backups

Export a backup from Settings and keep it private. Backups contain readable financial records. Imports combine records after a preview and explicit conflict choices. Missing records never delete current records. An old backup can restore previously deleted records.

Version-two backups include goals, contribution history, preferences, and budget alert thresholds. Version-one PHP backups remain readable and do not reset newer local settings or remove newer records. Backups with another denomination cannot silently relabel existing money.

If another tab changes records after the preview, choose the file again. A failed import leaves current records intact.

## Upgrade safely

Export a backup before opening the redesigned app for the first time. Close old PennyWise tabs and update the app before continuing. Schema version 2 migrates version-one records transactionally, preserves identifiers, adds an 80% budget threshold, and creates default preferences.

Current clients close on external schema upgrades and reject unsupported newer schemas. Already-installed version-one bundles cannot retroactively receive that guard. A failed upgrade must not be fixed by clearing browser storage.

## Architecture and limits

Read [the implementation reference](docs/implementation.md) for data ownership, financial definitions, and verification scope. React components use Tailwind. Analytics and report exports are separate from financial commands. Dexie owns the local database, and the service worker caches app files rather than financial records.

Inter and JetBrains Mono are self-hosted through Fontsource packages. Lucide supplies interface icons. No backend, authentication, Next.js migration, bank connection, or push notification service is included. Physical phone installation and Safari remain unverified.
