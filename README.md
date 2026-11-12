# PennyWise

PennyWise is a personal finance PWA for Philippine pesos. Track income, expenses, transfers, monthly budgets, and bills. Records stay in your browser. Recording a bill payment creates an expense without sending money to a provider.

## Run locally

Install Node.js 22.12 or later. In this folder, run:

```sh
npm ci
npm run dev
```

Open the address printed by Vite. Add an account and its opening balance to start. The app contains no sample financial records.

## Check the app

```sh
npm run check
npm run test:browser
```

The browser check starts a production preview on port 4173 and uses an isolated browser context with synthetic records. On Windows, it uses installed Google Chrome. On other systems, install Chromium with `npx playwright install chromium` first. Evidence is written to `output/playwright`.

## Try offline use

```sh
npm run build
npm run preview -- --port 4173
```

Open the production preview online once. In Settings, wait for the offline-ready message before disconnecting. Offline caching is enabled in production builds. Use your browser's installation action when supported.

## Keep backups

Export a backup from Settings and keep it somewhere private. Backup files contain readable financial records. Imports combine records after a preview and conflict choices. Missing records never delete existing records. An older backup can bring back previously deleted records.

If another tab changes your records after an import preview, choose the file again to build a fresh preview. A failed import leaves the current records intact.

## Release constraints

Deploy `dist` to a stable HTTPS origin at its root path. A different origin has a separate browser database. Choose that address before entering real records. This repository does not include a hosted release, cloud recovery, bank connections, or background notifications.

The database starts at schema version 1. Future upgrades require explicit transactional migrations and migration tests. Do not delete the database as an upgrade fallback.

## Architecture

Read [the implementation contract](docs/implementation.md). Financial commands and validation live in `src/finance`. React screens consume committed snapshots. The service worker caches app files, not financial records.

DM Sans and Lora are self-hosted under the SIL Open Font License. Their license files are in `public/fonts`. Interface icons come from Lucide.
