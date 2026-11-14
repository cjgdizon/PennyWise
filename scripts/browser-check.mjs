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
server.stdout.on("data", (v) => (serverOutput += v));
server.stderr.on("data", (v) => (serverOutput += v));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser, page, originalServiceWorker;
const checks = [],
  errors = [];
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
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
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  const nav = async (name) => {
    const rail = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    if (await rail.isVisible())
      await rail.getByRole("button", { name, exact: true }).click();
    else {
      await page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("button", { name: "More", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name, exact: true })
        .click();
    }
  };
  const dialog = page.getByRole("dialog");
  const save = async () => {
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
  };
  await page.screenshot({
    path: fileURLToPath(new URL("empty-desktop.png", artifacts)),
    fullPage: true,
  });
  await nav("Accounts");
  await page
    .getByRole("button", { name: "Add account", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Account name", { exact: true }).fill("Cash (test)");
  await dialog.getByLabel("Opening balance (PHP)").fill("10000");
  await save();
  await page
    .getByRole("button", { name: "Add account", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Account name", { exact: true }).fill("Bank (test)");
  await dialog.getByLabel("Account type").selectOption("bank");
  await dialog.getByLabel("Opening balance (PHP)").fill("5000");
  await save();
  checks.push("Accounts persist opening balances");
  async function entry(kind, amount, note) {
    await page
      .getByRole("button", { name: "Log transaction", exact: true })
      .first()
      .click();
    await dialog.getByRole("button", { name: kind, exact: true }).click();
    await dialog.getByLabel("Amount (PHP)", { exact: true }).fill(amount);
    if (kind === "transfer") {
      await dialog
        .getByLabel("From account")
        .selectOption({ label: "Cash (test)" });
      await dialog
        .getByLabel("To account")
        .selectOption({ label: "Bank (test)" });
    } else {
      await dialog
        .getByLabel("Account", { exact: true })
        .selectOption({ label: "Cash (test)" });
      await dialog
        .getByRole("button", {
          name: kind === "income" ? "Salary" : "Food & groceries",
          exact: true,
        })
        .click();
    }
    await dialog.getByLabel("Note (optional)").fill(note);
    await save();
  }
  await entry("income", "1000", "Pay (test)");
  await entry("expense", "500.25", "Groceries (test)");
  await entry("transfer", "100", "Move (test)");
  checks.push("Quick-entry income, expense and transfer");
  await page.keyboard.press("n");
  await dialog.waitFor();
  assert.equal(
    await dialog
      .getByLabel("Amount (PHP)", { exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  checks.push("N shortcut focuses amount");
  await nav("Budgets");
  await page
    .getByRole("button", { name: "Add budget", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Monthly limit (PHP)").fill("1000");
  await dialog.getByLabel("Alert threshold (%)").fill("80");
  await save();
  await nav("Savings");
  await page
    .getByRole("button", { name: "New goal", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Goal name").fill("Emergency fund (test)");
  await dialog.getByLabel("Target amount (PHP)").fill("5000");
  await save();
  await page
    .getByRole("button", { name: "Add funds", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("1000");
  await save();
  checks.push("Budgets and savings reserve existing funds");
  await nav("Bills");
  await page
    .getByRole("button", { name: "Add bill", exact: true })
    .first()
    .click();
  await dialog.getByLabel("Bill name").fill("Internet (test)");
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("250");
  await save();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .first()
    .click();
  await save();
  checks.push("Bill payment creates expense");
  await nav("Reports");
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const csv = await csvDownload;
  const csvPath = new URL("report.csv", artifacts);
  await csv.saveAs(fileURLToPath(csvPath));
  assert.match(await readFile(csvPath, "utf8"), /Groceries \(test\)/);
  checks.push("Reports export matching transactions");
  const printWindow = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const printed = await printWindow;
  await printed.getByRole("heading", { name: "PennyWise report" }).waitFor();
  assert.match(await printed.locator("table").innerText(), /Groceries \(test\)/);
  await printed.close();
  checks.push("PDF action opens the filtered printable report");
  await nav("Settings");
  const backupDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backupFile = await backupDownload;
  const backupPath = new URL("backup.json", artifacts);
  await backupFile.saveAs(fileURLToPath(backupPath));
  const backup = await readFile(backupPath, "utf8");
  assert.equal(JSON.parse(backup).version, 2);
  assert.equal(JSON.parse(backup).data.transactions.length, 4);
  assert.equal(JSON.parse(backup).data.contributions.length, 1);
  await page
    .getByLabel("Import backup file")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
  await dialog.waitFor();
  await dialog
    .getByRole("button", { name: "Combine records", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  checks.push("Version-two backup round trip includes savings");
  const altered = JSON.parse(backup);
  altered.data.transactions.find((t) => t.note === "Groceries (test)").amount =
    60025;
  await page
    .getByLabel("Import backup file")
    .setInputFiles({
      name: "changed.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(altered)),
    });
  await dialog.waitFor();
  assert.equal(
    await dialog
      .getByRole("button", { name: "Combine records", exact: true })
      .isDisabled(),
    true,
  );
  await dialog.getByLabel("Keep current").check();
  await dialog
    .getByRole("button", { name: "Combine records", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  checks.push("Backup conflict requires explicit choice");
  await page
    .getByLabel("Import backup file")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad"),
    });
  await page.getByRole("alert").filter({ hasText: "not valid JSON" }).waitFor();
  checks.push("Invalid backup leaves records intact");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await dialog.getByLabel("Category name").fill("Family celebrations and weekend activities");
  await save();
  await page.getByRole("button", { name: "Log transaction", exact: true }).first().click();
  await dialog.getByLabel("Amount (PHP)", { exact: true }).fill("1.25");
  await dialog.getByRole("button", { name: "Family celebrations and weekend activities", exact: true }).click();
  await dialog.getByLabel("Note (optional)").fill("Weekend (test)");
  await save();
  checks.push("Custom categories remain usable in quick entry");

  await nav("Overview");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  for (const [theme, width, height, name] of [
    ["light", 1440, 1050, "desktop"],
    ["dark", 1440, 1050, "desktop-dark"],
    ["light", 390, 844, "mobile"],
    ["dark", 390, 844, "mobile-dark"],
  ]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction(
      (dark) => document.documentElement.classList.contains("dark") === dark,
      theme === "dark",
    );
    await page.setViewportSize({ width, height });
    if (width === 390) {
      const allowance = page.locator("section").filter({ has: page.getByText("Safe to spend", { exact: true }) }).first();
      const box = await allowance.boundingBox();
      assert.ok(box && box.y + box.height < height - 72, "Safe-to-spend must be visible above phone navigation");
      assert.match(await allowance.innerText(), /Budget left/);
    }
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}.png`, artifacts)),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  checks.push("Desktop and phone layouts in both themes have no overflow");
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(
    () => !document.documentElement.classList.contains("dark"),
  );
  for (const screen of ["Budgets", "Savings", "Reports", "Settings"]) {
    await nav(screen);
    await page.screenshot({
      path: fileURLToPath(
        new URL(screen.toLowerCase() + "-mobile.png", artifacts),
      ),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Log transaction", exact: true })
    .click();
  await dialog.waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL("quick-add-mobile.png", artifacts)),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Appearance").selectOption("dark");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.reload();
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await nav("Settings");
  await page.getByLabel("Appearance").selectOption("system");
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  checks.push("Theme preference persists across reopening");
  await nav("Overview");

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.emulateMedia({ colorScheme: "light" });
  const second = await context.newPage();
  await second.goto(base);
  await second
    .getByRole("button", { name: "Log transaction", exact: true })
    .first()
    .click();
  await second
    .getByRole("dialog")
    .getByLabel("Amount (PHP)", { exact: true })
    .fill("12.34");
  originalServiceWorker = await readFile(
    new URL("../dist/sw.js", import.meta.url),
    "utf8",
  );
  await writeFile(
    new URL("../dist/sw.js", import.meta.url),
    `${originalServiceWorker}\n/* test ${Date.now()} */`,
  );
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await page.getByRole("button", { name: "Update app", exact: true }).waitFor();
  await second
    .getByRole("button", { name: "Update app", exact: true })
    .waitFor();
  assert.equal(
    await second
      .getByRole("button", { name: "Update app", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Update app", exact: true }).click();
  await second
    .getByRole("button", { name: "Reload app", exact: true })
    .waitFor();
  assert.equal(
    await second
      .getByRole("dialog")
      .getByLabel("Amount (PHP)", { exact: true })
      .inputValue(),
    "12.34",
  );
  await second.close();
  checks.push("Cross-tab update retains unsaved entry");
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /15,248.50/);
  checks.push("Offline reopening retains balances");
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("results.json", artifacts),
    JSON.stringify({ result: "PASS", checks, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ result: "PASS", checks }, null, 2));
} catch (error) {
  if (page) {
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
  if (originalServiceWorker)
    await writeFile(
      new URL("../dist/sw.js", import.meta.url),
      originalServiceWorker,
    );
  await browser?.close();
  server.kill();
}
