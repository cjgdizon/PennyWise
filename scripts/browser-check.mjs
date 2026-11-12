import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const base = "http://127.0.0.1:4173";
const artifacts = new URL("../output/playwright/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
    "--strictPort",
  ],
  { stdio: "pipe", windowsHide: true },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
let page;
let originalServiceWorker;
const errors = [];
const checks = [];
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Preview server failed: ${serverOutput}`);
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await sleep(100);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" ? { channel: "chrome" } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page
    .getByRole("heading", { name: "A little clarity, every day." })
    .waitFor();
  const dialog = page.getByRole("dialog");
  const save = async () => {
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
  };
  await page.getByRole("button", { name: "Set up an account" }).click();
  await dialog.getByLabel("Account name").fill("Cash (test)");
  await dialog.getByLabel("Opening balance (PHP)").fill("10000");
  await save();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await dialog.getByLabel("Account name").fill("Bank (test)");
  await dialog.getByLabel("Account type").selectOption("bank");
  await dialog.getByLabel("Opening balance (PHP)").fill("5000");
  await save();
  checks.push("First-run account creation and opening balances");
  async function transaction(kind, amount, note) {
    await page
      .getByRole("button", { name: "Add transaction", exact: true })
      .click();
    await dialog.getByRole("button", { name: kind, exact: true }).click();
    await dialog.getByLabel("Amount (PHP)").fill(amount);
    if (kind !== "transfer") {
      await dialog
        .getByRole("combobox", { name: "Account", exact: true })
        .selectOption({ label: "Cash (test)" });
      await dialog
        .getByLabel("Category")
        .selectOption({
          label: kind === "income" ? "Salary" : "Food & groceries",
        });
    } else {
      await dialog
        .getByLabel("From account")
        .selectOption({ label: "Cash (test)" });
      await dialog
        .getByLabel("To account")
        .selectOption({ label: "Bank (test)" });
    }
    await dialog.getByLabel("Note").fill(note);
    await save();
  }
  await transaction("expense", "650.25", "Groceries (test)");
  await transaction("income", "2000", "Salary (test)");
  await transaction("transfer", "500", "Move to bank (test)");
  await page
    .locator(".balance-main")
    .filter({ hasText: /16,349\.75/ })
    .waitFor();
  assert.match(await page.locator(".balance-main").innerText(), /16,349\.75/);
  checks.push("Income, expense, transfer, and exact displayed total");
  await page.getByRole("button", { name: "Add budget", exact: true }).click();
  await dialog
    .getByLabel("Category")
    .selectOption({ label: "Food & groceries" });
  await dialog.getByLabel("Monthly limit (PHP)").fill("1000");
  await save();
  await page
    .locator(".budget-row")
    .filter({ hasText: /349\.75 left/ })
    .waitFor();
  assert.match(await page.locator(".budget-row").innerText(), /349\.75 left/);
  checks.push("Budget spending and remaining balance");
  await page.getByRole("button", { name: "Add your first bill" }).click();
  await dialog.getByLabel("Bill name").fill("Internet (test)");
  await dialog.getByLabel("Amount (PHP)").fill("1700");
  await dialog
    .getByLabel("Category")
    .selectOption({ label: "Home & utilities" });
  await save();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .first()
    .click();
  await dialog
    .getByLabel("Paying account")
    .selectOption({ label: "Cash (test)" });
  await dialog
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .locator(".balance-main")
    .filter({ hasText: /14,649\.75/ })
    .waitFor();
  assert.match(await page.locator(".balance-main").innerText(), /14,649\.75/);
  checks.push("Bill payment creates exactly one expense");
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Groceries (test)", exact: true })
    .click();
  await dialog.getByLabel("Amount (PHP)").fill("700.25");
  await save();
  checks.push("Existing expense can be edited");
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const download = await downloadPromise;
  const backupPath = new URL("backup.json", artifacts);
  await download.saveAs(fileURLToPath(backupPath));
  const backup = await readFile(backupPath, "utf8");
  assert.equal(JSON.parse(backup).data.transactions.length, 4);
  await page
    .getByLabel("Import backup file")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
  await page.getByRole("heading", { name: "Review your backup" }).waitFor();
  assert.match(await dialog.innerText(), /0 records to add/);
  await dialog
    .getByRole("button", { name: "Combine records", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  checks.push("Backup export and repeated import skip identical records");
  const altered = JSON.parse(backup);
  altered.data.transactions.find((t) => t.note === "Groceries (test)").amount =
    75025;
  await page
    .getByLabel("Import backup file")
    .setInputFiles({
      name: "changed.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(altered)),
    });
  await page.getByRole("heading", { name: "Review your backup" }).waitFor();
  await dialog.getByLabel("Use imported").check();
  await dialog
    .getByRole("button", { name: "Combine records", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  checks.push("Changed backup conflict requires explicit imported choice");
  await page
    .getByLabel("Import backup file")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad"),
    });
  await page.getByRole("alert").filter({ hasText: "not valid JSON" }).waitFor();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  checks.push("Invalid JSON displays an error without replacing records");
  await page.getByLabel("Import backup file").setInputFiles({ name: "older.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await page.getByRole("heading", { name: "Review your backup" }).waitFor();
  await dialog.getByLabel("Keep current").check();
  const secondTab = await context.newPage();
  await secondTab.goto(base);
  await secondTab.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("button", { name: "Settings", exact: true }).click();
  await secondTab.getByRole("button", { name: "Add", exact: true }).click();
  await secondTab.getByRole("dialog").getByLabel("Category name").fill("Weekend (test)");
  await secondTab.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await secondTab.getByRole("dialog").waitFor({ state: "hidden" });
  await dialog.getByRole("button", { name: "Combine records", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "records changed" }).waitFor();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  checks.push("Another tab changing records invalidates an open backup preview");
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("heading", { name: "A little clarity, every day." })
    .waitFor();
  await page
    .locator(".balance-main")
    .filter({ hasText: /14,549\.75/ })
    .waitFor();
  assert.match(await page.locator(".balance-main").innerText(), /14,549\.75/);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.screenshot({
    path: fileURLToPath(new URL("desktop.png", artifacts)),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: fileURLToPath(new URL("mobile.png", artifacts)),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  checks.push("Desktop and phone layouts have no horizontal overflow");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.screenshot({ path: fileURLToPath(new URL("mobile-bottom.png", artifacts)), fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 0));
  await secondTab.getByRole("button", { name: "Add transaction", exact: true }).click();
  await secondTab.getByRole("dialog").getByLabel("Amount (PHP)").fill("12.34");
  originalServiceWorker = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
  await writeFile(new URL("../dist/sw.js", import.meta.url), `${originalServiceWorker}\n/* browser-check ${Date.now()} */`);
  await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
  await page.getByRole("button", { name: "Update app", exact: true }).waitFor();
  await secondTab.getByRole("button", { name: "Update app", exact: true }).waitFor();
  assert.equal(await secondTab.getByRole("button", { name: "Update app", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Update app", exact: true }).click();
  await secondTab.getByRole("button", { name: "Reload app", exact: true }).waitFor();
  assert.equal(await secondTab.getByRole("dialog").getByLabel("Amount (PHP)").inputValue(), "12.34");
  assert.equal(await secondTab.getByRole("button", { name: "Reload app", exact: true }).isDisabled(), true);
  await secondTab.close();
  checks.push("Updating from another tab preserves an unsaved transaction form");
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("heading", { name: "A little clarity, every day." })
    .waitFor();
  assert.match(await page.locator(".balance-main").innerText(), /14,549\.75/);
  await page
    .getByRole("navigation", { name: "Mobile navigation", exact: true })
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete Internet (test)", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("navigation", { name: "Mobile navigation", exact: true })
    .getByRole("button", { name: "Bills", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .first()
    .waitFor();
  checks.push(
    "Offline reopening retains records and deleting a payment reopens its bill",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("results.json", artifacts),
    JSON.stringify({ result: "PASS", checks, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ result: "PASS", checks }, null, 2));
} catch (error) {
  if (page) {
    await writeFile(new URL("failure.html", artifacts), await page.content());
    await writeFile(
      new URL("failure.txt", artifacts),
      await page.locator("body").ariaSnapshot(),
    );
    await page.screenshot({
      path: fileURLToPath(new URL("failure.png", artifacts)),
      fullPage: true,
    });
  }
  throw error;
} finally {
  if (originalServiceWorker) await writeFile(new URL("../dist/sw.js", import.meta.url), originalServiceWorker);
  await browser?.close();
  server.kill();
}
