import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { balanceFor, finance, money, occurrences, parseMoney, today, defaultPreferences } from "./index";
import { allTables, database } from "./storage";
import type {
  Account,
  Bill,
  ConflictChoices,
  Snapshot,
  Transaction,
} from "./types";

beforeEach(async () => {
  await database.transaction("rw", allTables, async () => {
    for (const table of allTables) await table.clear();
  });
  await finance.initialize();
});
afterAll(() => database.close());

async function account(
  id = "cash",
  openingBalance = 100_000,
): Promise<Account> {
  return finance.saveAccount({
    id,
    name: id,
    type: "cash",
    openingBalance,
    archived: false,
  });
}

async function expense(amount = 12_950): Promise<Transaction> {
  return finance.saveTransaction({
    kind: "expense",
    accountId: "cash",
    categoryId: "00000000-0000-4000-8000-000000000001",
    amount,
    date: "2026-11-12",
    note: "Groceries",
  });
}

async function monthlyBill(): Promise<Bill> {
  return finance.saveBill({
    name: "Internet",
    categoryId: "00000000-0000-4000-8000-000000000003",
    amount: 170_000,
    startDate: "2026-01-31",
    recurrence: "monthly",
    archived: false,
  });
}

function backup(data: Snapshot): string {
  return JSON.stringify({
    app: "PennyWise",
    version: 1,
    currency: "PHP",
    data,
  });
}

describe("money and calendar rules", () => {
  it("parses exact centavos without floating point multiplication", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("1234.5")).toBe(123450);
    expect(parseMoney("-12.05", true)).toBe(-1205);
    expect(money(12950)).toContain("129.50");
    expect(money(Number.MAX_SAFE_INTEGER)).toBe("₱90,071,992,547,409.91");
    expect(money(-1)).toBe("-₱0.01");
  });

  it("rejects ambiguous precision, negative expenses, and unsafe amounts", () => {
    for (const value of [
      "1.001",
      "-1",
      "1e3",
      "1,000",
      "NaN",
      "90071992547409.92",
    ])
      expect(() => parseMoney(value)).toThrow();
  });

  it("clamps monthly anchors in February and returns to the original day", async () => {
    const bill = await monthlyBill();
    expect(
      occurrences([bill], [], "2026-01-01", "2026-03-31").map(
        (row) => row.dueDate,
      ),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(
      occurrences(
        [{ ...bill, startDate: "2028-01-31" }],
        [],
        "2028-02-01",
        "2028-02-29",
      ).map((row) => row.dueDate),
    ).toEqual(["2028-02-29"]);
  });

  it("keeps date-only records in their specified month", async () => {
    await account();
    const entry = await finance.saveTransaction({
      kind: "expense",
      accountId: "cash",
      categoryId: "00000000-0000-4000-8000-000000000001",
      amount: 1,
      date: "2026-03-01",
      note: "",
    });
    expect(entry.date).toBe("2026-03-01");
    await expect(
      finance.saveTransaction({ ...entry, date: "2026-02-30" }),
    ).rejects.toThrow("valid calendar date");
  });
});

describe("financial commands", () => {
  it("initializes categories without fake accounts or duplicate records", async () => {
    const initial = await finance.getSnapshot();
    await finance.initialize();
    expect((await finance.getSnapshot()).categories).toEqual(
      initial.categories,
    );
    expect(initial.accounts).toEqual([]);
    expect(initial.transactions).toEqual([]);
    expect((await finance.getSnapshot()).revision).toBe(initial.revision);
  });

  it("derives balances from transactions and preserves combined balance on transfers", async () => {
    const cash = await account("cash", 100_000);
    const wallet = await account("wallet", 0);
    await expense(12_950);
    await finance.saveTransaction({
      kind: "income",
      accountId: "cash",
      categoryId: "00000000-0000-4000-8000-000000000007",
      amount: 500_000,
      date: "2026-11-12",
      note: "Salary",
    });
    await finance.saveTransaction({
      kind: "transfer",
      fromAccountId: "cash",
      toAccountId: "wallet",
      amount: 20_000,
      date: "2026-11-12",
      note: "",
    });
    const snapshot = await finance.getSnapshot();
    expect(balanceFor(cash, snapshot.transactions)).toBe(567050);
    expect(balanceFor(wallet, snapshot.transactions)).toBe(20000);
    expect(
      snapshot.transactions
        .filter((row) => row.kind === "expense")
        .map((row) => row.amount),
    ).toEqual([12950]);
  });

  it("rejects transfers to the same account and missing references without writes", async () => {
    await account();
    const before = await finance.getSnapshot();
    await expect(
      finance.saveTransaction({
        kind: "transfer",
        fromAccountId: "cash",
        toAccountId: "cash",
        amount: 100,
        date: "2026-11-12",
        note: "",
      }),
    ).rejects.toThrow("different accounts");
    await expect(
      finance.saveTransaction({
        kind: "income",
        accountId: "missing",
        categoryId: "00000000-0000-4000-8000-000000000007",
        amount: 100,
        date: "2026-11-12",
        note: "",
      }),
    ).rejects.toThrow("active account");
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("advances revision on saves and preserves history when accounts are archived", async () => {
    const before = await finance.getSnapshot();
    const cash = await account();
    const transaction = await expense();
    await finance.archiveAccount(cash.id);
    const after = await finance.getSnapshot();
    expect(after.revision).toBe(before.revision + 3);
    expect(after.transactions).toEqual([transaction]);
    expect(balanceFor(after.accounts[0], after.transactions)).toBe(87050);
    await expect(expense()).rejects.toThrow("active account");
  });

  it("creates exactly one linked expense for simultaneous payments", async () => {
    await account("cash", 500_000);
    const bill = await monthlyBill();
    const input = {
      billId: bill.id,
      dueDate: "2026-02-28",
      accountId: "cash",
      amount: 170_000,
      date: "2026-02-27",
    };
    const [first, second] = await Promise.all([
      finance.payBill(input),
      finance.payBill(input),
    ]);
    expect(first.id).toBe(second.id);
    const snapshot = await finance.getSnapshot();
    expect(snapshot.transactions).toHaveLength(1);
    expect(balanceFor(snapshot.accounts[0], snapshot.transactions)).toBe(
      330000,
    );
    expect(
      occurrences([bill], snapshot.transactions, "2026-02-01", "2026-02-28")[0]
        .paid,
    ).toBe(true);
  });

  it("recalculates edited payments and reopens the bill after deletion", async () => {
    await account("cash", 500_000);
    const bill = await monthlyBill();
    const payment = await finance.payBill({
      billId: bill.id,
      dueDate: "2026-02-28",
      accountId: "cash",
      amount: 170_000,
      date: "2026-02-27",
    });
    await finance.saveTransaction({ ...payment, amount: 180_000 });
    let snapshot = await finance.getSnapshot();
    expect(balanceFor(snapshot.accounts[0], snapshot.transactions)).toBe(
      320000,
    );
    await finance.deleteTransaction(payment.id);
    snapshot = await finance.getSnapshot();
    expect(balanceFor(snapshot.accounts[0], snapshot.transactions)).toBe(
      500000,
    );
    expect(
      occurrences([bill], snapshot.transactions, "2026-02-01", "2026-02-28")[0]
        .paid,
    ).toBe(false);
  });

  it("protects paid bill schedule identity and the payment link", async () => {
    await account("cash", 500_000);
    const bill = await monthlyBill();
    const payment = await finance.payBill({
      billId: bill.id,
      dueDate: "2026-02-28",
      accountId: "cash",
      amount: 170_000,
      date: "2026-02-27",
    });
    await expect(
      finance.saveBill({ ...bill, startDate: "2026-01-15" }),
    ).rejects.toThrow("payment history");
    if (payment.kind !== "expense") throw new Error("Expected an expense.");
    await expect(
      finance.saveTransaction({ ...payment, dueDate: "2026-03-31" }),
    ).rejects.toThrow("link cannot change");
    expect((await finance.getSnapshot()).bills[0].startDate).toBe("2026-01-31");
  });

  it("updates an existing category budget instead of adding a duplicate", async () => {
    const first = await finance.saveBudget({
      month: "2026-11",
      categoryId: "00000000-0000-4000-8000-000000000001",
      amount: 600_000,
    });
    const second = await finance.saveBudget({
      month: "2026-11",
      categoryId: "00000000-0000-4000-8000-000000000001",
      amount: 700_000,
    });
    expect(second.id).toBe(first.id);
    expect(
      (await finance.getSnapshot()).budgets.map((row) => row.amount),
    ).toEqual([700000]);
  });

  it("rejects individually valid money when the combined balance overflows", async () => {
    await account("cash", Number.MAX_SAFE_INTEGER);
    const before = await finance.getSnapshot();
    await expect(
      finance.saveTransaction({
        kind: "income",
        accountId: "cash",
        categoryId: "00000000-0000-4000-8000-000000000007",
        amount: 1,
        date: "2026-11-12",
        note: "",
      }),
    ).rejects.toThrow("combined amount");
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("checks sums across accounts and expense records rather than just individual amounts", async () => {
    await account("cash", Number.MAX_SAFE_INTEGER);
    const before = await finance.getSnapshot();
    await expect(account("wallet", 1)).rejects.toThrow("combined amount");
    expect(await finance.getSnapshot()).toEqual(before);
    await finance.saveAccount({ ...before.accounts[0], openingBalance: 0 });
    await expense(Number.MAX_SAFE_INTEGER);
    await expect(expense(1)).rejects.toThrow("combined amount");
    expect(
      (await finance.getSnapshot()).transactions.map((row) => row.amount),
    ).toEqual([Number.MAX_SAFE_INTEGER]);
  });
});

describe("backup combining", () => {
  it("exports a versioned round-trip and skips an identical repeated import", async () => {
    await account();
    await expense();
    const text = await finance.exportBackup();
    expect(JSON.parse(text).currency).toBe("PHP");
    const preview = await finance.previewImport(text);
    expect(preview.conflicts).toEqual([]);
    expect(preview.added).toBe(0);
    expect(preview.skipped).toBe(12);
    const before = await finance.getSnapshot();
    expect(await finance.commitImport(preview, {})).toEqual({
      added: 0,
      skipped: 12,
      replaced: 0,
    });
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("previews changed same-ID records and only replaces after an explicit choice", async () => {
    await account();
    const entry = await expense();
    const incoming = await finance.getSnapshot();
    incoming.transactions[0].amount = 20_000;
    const preview = await finance.previewImport(backup(incoming));
    expect(preview.conflicts).toHaveLength(1);
    await expect(finance.commitImport(preview, {})).rejects.toThrow(
      "every conflict",
    );
    expect((await finance.getSnapshot()).transactions[0].amount).toBe(12950);
    const choices: ConflictChoices = { [preview.conflicts[0].key]: "incoming" };
    expect((await finance.commitImport(preview, choices)).replaced).toBe(1);
    expect((await finance.getSnapshot()).transactions).toEqual([
      { ...entry, amount: 20000 },
    ]);
  });

  it("rejects stale previews after another write and preserves the newer record", async () => {
    await account();
    const preview = await finance.previewImport(await finance.exportBackup());
    await expense();
    const before = await finance.getSnapshot();
    await expect(finance.commitImport(preview, {})).rejects.toThrow(
      "records changed",
    );
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("keeps current records missing from an old backup and previews restored deleted records", async () => {
    await account();
    const entry = await expense();
    const old = await finance.exportBackup();
    await finance.deleteTransaction(entry.id);
    const additional = await expense(500);
    const preview = await finance.previewImport(old);
    expect(preview.added).toBe(1);
    await finance.commitImport(preview, {});
    expect(
      (await finance.getSnapshot()).transactions.map((row) => row.id).sort(),
    ).toEqual([entry.id, additional.id].sort());
    const repeated = await finance.previewImport(old);
    expect(repeated.added).toBe(0);
  });

  it("detects duplicate budget business keys even when IDs differ", async () => {
    const first = await finance.saveBudget({
      month: "2026-11",
      categoryId: "00000000-0000-4000-8000-000000000001",
      amount: 600_000,
    });
    const incoming = await finance.getSnapshot();
    incoming.budgets = [{ ...first, id: "budget-other", amount: 700_000 }];
    const preview = await finance.previewImport(backup(incoming));
    expect(preview.conflicts).toHaveLength(1);
    await finance.commitImport(preview, {
      [preview.conflicts[0].key]: "incoming",
    });
    expect((await finance.getSnapshot()).budgets).toEqual([
      { ...first, id: "budget-other", amount: 700000 },
    ]);
  });

  it("preserves both accepted budgets when imported business keys swap", async () => {
    const food = await finance.saveBudget({
      month: "2026-11",
      categoryId: "00000000-0000-4000-8000-000000000001",
      amount: 600_000,
    });
    const home = await finance.saveBudget({
      month: "2026-11",
      categoryId: "00000000-0000-4000-8000-000000000003",
      amount: 700_000,
    });
    const incoming = await finance.getSnapshot();
    incoming.budgets = [
      { ...food, categoryId: home.categoryId },
      { ...home, categoryId: food.categoryId },
    ];
    const preview = await finance.previewImport(backup(incoming));
    expect(preview.conflicts).toHaveLength(4);
    const choices = Object.fromEntries(
      preview.conflicts.map((conflict) => [conflict.key, "incoming" as const]),
    );
    expect((await finance.commitImport(preview, choices)).replaced).toBe(2);
    expect(
      (await finance.getSnapshot()).budgets.sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    ).toEqual(incoming.budgets.sort((a, b) => a.id.localeCompare(b.id)));
  });

  it("rejects overlapping choices that would remove a record explicitly kept current", async () => {
    const food = await finance.saveBudget({
      month: "2026-11",
      categoryId: "00000000-0000-4000-8000-000000000001",
      amount: 600_000,
    });
    const home = await finance.saveBudget({
      month: "2026-11",
      categoryId: "00000000-0000-4000-8000-000000000003",
      amount: 700_000,
    });
    const before = await finance.getSnapshot();
    const incoming = structuredClone(before);
    incoming.budgets = [
      { ...food, categoryId: home.categoryId },
      { ...home, categoryId: food.categoryId },
    ];
    const preview = await finance.previewImport(backup(incoming));
    const choices = Object.fromEntries(
      preview.conflicts.map((conflict) => [
        conflict.key,
        conflict.incoming.id === food.id
          ? ("incoming" as const)
          : ("current" as const),
      ]),
    );
    await expect(finance.commitImport(preview, choices)).rejects.toThrow(
      "Overlapping conflict choices",
    );
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("detects independent payments for the same occurrence and imports only the chosen payment", async () => {
    await account("cash", 500_000);
    const bill = await monthlyBill();
    const payment = await finance.payBill({
      billId: bill.id,
      dueDate: "2026-02-28",
      accountId: "cash",
      amount: 170_000,
      date: "2026-02-27",
    });
    const incoming = await finance.getSnapshot();
    incoming.transactions = [
      { ...payment, id: "independent-payment", amount: 180_000 },
    ];
    const preview = await finance.previewImport(backup(incoming));
    expect(preview.conflicts).toHaveLength(1);
    await finance.commitImport(preview, {
      [preview.conflicts[0].key]: "incoming",
    });
    const snapshot = await finance.getSnapshot();
    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.transactions[0].id).toBe("independent-payment");
    expect(balanceFor(snapshot.accounts[0], snapshot.transactions)).toBe(
      320000,
    );
  });

  it("rejects an import that changes an existing payment occurrence identity", async () => {
    await account("cash", 500_000);
    const bill = await monthlyBill();
    const payment = await finance.payBill({
      billId: bill.id,
      dueDate: "2026-02-28",
      accountId: "cash",
      amount: 170_000,
      date: "2026-02-27",
    });
    const before = await finance.getSnapshot();
    const incoming = structuredClone(before);
    incoming.transactions = [
      {
        ...payment,
        kind: "expense",
        accountId: "cash",
        categoryId: "00000000-0000-4000-8000-000000000003",
        billId: bill.id,
        dueDate: "2026-03-31",
      },
    ];
    await expect(finance.previewImport(backup(incoming))).rejects.toThrow(
      "occurrence link",
    );
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("rejects malformed backups, unknown versions, missing references, and incompatible kinds without changing data", async () => {
    await account();
    await expense();
    const before = await finance.getSnapshot();
    await expect(finance.previewImport("{bad")).rejects.toThrow("valid JSON");
    await expect(
      finance.previewImport(
        JSON.stringify({
          app: "PennyWise",
          version: 3,
          currency: "PHP",
          data: before,
        }),
      ),
    ).rejects.toThrow("supported");
    const missing = structuredClone(before);
    missing.accounts = [];
    await expect(finance.previewImport(backup(missing))).rejects.toThrow(
      "missing account",
    );
    const incompatible = structuredClone(before);
    incompatible.transactions = [
      {
        id: before.transactions[0].id,
        kind: "income",
        accountId: "cash",
        categoryId: "00000000-0000-4000-8000-000000000007",
        amount: 100,
        date: "2026-11-12",
        note: "",
      },
    ];
    await expect(finance.previewImport(backup(incompatible))).rejects.toThrow(
      "incompatible",
    );
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("rolls back all imported changes when storage fails after an earlier table write", async () => {
    await account();
    const before = await finance.getSnapshot();
    const incoming = structuredClone(before);
    incoming.accounts.push({
      id: "new-wallet",
      name: "Wallet",
      type: "ewallet",
      openingBalance: 1000,
      archived: false,
    });
    incoming.transactions.push({
      id: "new-expense",
      kind: "expense",
      accountId: "new-wallet",
      categoryId: "00000000-0000-4000-8000-000000000001",
      amount: 100,
      date: "2026-11-12",
      note: "",
    });
    const preview = await finance.previewImport(backup(incoming));
    const failWrite = () => {
      throw new Error("Storage is full.");
    };
    database.table("transactions").hook("creating", failWrite);
    try {
      await expect(finance.commitImport(preview, {})).rejects.toThrow(
        "Storage is full",
      );
    } finally {
      database.table("transactions").hook("creating").unsubscribe(failWrite);
    }
    expect(await finance.getSnapshot()).toEqual(before);
  });
});

describe("savings reservations and preferences", () => {
  it("reserves and releases money without creating transactions or moving account balances", async () => {
    await account("cash", 100_000);
    const goal = await finance.saveGoal({ name: "Emergency fund", target: 200_000 });
    await finance.contribute({ goalId: goal.id, amount: 30_000, date: today() });
    await finance.contribute({ goalId: goal.id, amount: -10_000, date: today() });
    const snapshot = await finance.getSnapshot();
    expect(snapshot.contributions.map(row => row.amount).sort((a, b) => a - b)).toEqual([-10_000, 30_000]);
    expect(snapshot.transactions).toEqual([]);
    expect(balanceFor(snapshot.accounts[0], snapshot.transactions)).toBe(100_000);
    await expect(finance.deleteGoal(goal.id)).rejects.toThrow("Release");
    await finance.contribute({ goalId: goal.id, amount: -20_000, date: today() });
    await finance.deleteGoal(goal.id);
    expect((await finance.getSnapshot()).goals).toEqual([]);
    expect((await finance.getSnapshot()).contributions).toEqual([]);
  });

  it("rejects deposits beyond unreserved current funds and ignores future income", async () => {
    await account("cash", 10_000);
    await finance.saveTransaction({ kind: "income", accountId: "cash", categoryId: "00000000-0000-4000-8000-000000000007", amount: 200_000, date: "9999-01-01", note: "Future pay" });
    const first = await finance.saveGoal({ name: "First", target: 50_000 });
    const second = await finance.saveGoal({ name: "Second", target: 50_000 });
    await finance.contribute({ goalId: first.id, amount: 8_000, date: today() });
    const before = await finance.getSnapshot();
    await expect(finance.contribute({ goalId: second.id, amount: 2_001, date: today() })).rejects.toThrow("unreserved");
    await expect(finance.contribute({ goalId: first.id, amount: -8_001, date: today() })).rejects.toThrow("releases");
    await expect(finance.contribute({ goalId: first.id, amount: 0, date: today() })).rejects.toThrow("nonzero");
    await expect(finance.contribute({ goalId: first.id, amount: 1, date: "9999-01-01" })).rejects.toThrow("future");
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("permits later expenses to underfund reservations without changing savings history", async () => {
    await account("cash", 100_000);
    const goal = await finance.saveGoal({ name: "Rainy day", target: 100_000 });
    await finance.contribute({ goalId: goal.id, amount: 80_000, date: today() });
    await expense(50_000);
    const snapshot = await finance.getSnapshot();
    expect(snapshot.contributions[0].amount).toBe(80_000);
    expect(balanceFor(snapshot.accounts[0], snapshot.transactions)).toBe(50_000);
  });

  it("serializes simultaneous deposits so separate goals cannot reserve the same funds", async () => {
    await account("cash", 10_000);
    const a = await finance.saveGoal({ name: "A", target: 10_000 });
    const b = await finance.saveGoal({ name: "B", target: 10_000 });
    const results = await Promise.allSettled([finance.contribute({ goalId: a.id, amount: 8_000, date: today() }), finance.contribute({ goalId: b.id, amount: 8_000, date: today() })]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect((await finance.getSnapshot()).contributions).toHaveLength(1);
  });

  it("saves a local profile and USD before money exists, then prevents relabeling existing money", async () => {
    await finance.savePreferences({ ...defaultPreferences, name: "CJ", currency: "USD", theme: "dark", alerts: false });
    await account();
    await expect(finance.savePreferences({ ...defaultPreferences })).rejects.toThrow("Currency cannot change");
    await finance.savePreferences({ ...defaultPreferences, currency: "USD", theme: "light", name: "CJ" });
    expect((await finance.getSnapshot()).preferences).toEqual([{ ...defaultPreferences, currency: "USD", theme: "light", name: "CJ" }]);
    expect(money(12950, "USD")).toContain("129.50");
    expect(money(12950, "USD")).not.toContain("₱");
  });

  it("defaults budget thresholds and rejects out-of-range or fractional thresholds", async () => {
    const budget = await finance.saveBudget({ month: "2026-11", categoryId: "00000000-0000-4000-8000-000000000001", amount: 10_000 });
    expect(budget.alertThreshold).toBe(80);
    await finance.saveBudget({ ...budget, alertThreshold: 95 });
    for (const alertThreshold of [0, 100, 80.5, NaN]) await expect(finance.saveBudget({ ...budget, alertThreshold })).rejects.toThrow("threshold");
    expect((await finance.getSnapshot()).budgets[0].alertThreshold).toBe(95);
  });
});

describe("version-two backup extensions", () => {
  it("preserves goals, contributions, and preferences when combining a v1 backup", async () => {
    await account();
    const old = backup(await finance.getSnapshot());
    const goal = await finance.saveGoal({ name: "Emergency", target: 30_000 });
    await finance.contribute({ goalId: goal.id, amount: 10_000, date: today() });
    await finance.savePreferences({ ...defaultPreferences, name: "Local profile", theme: "dark", alerts: false });
    const before = await finance.getSnapshot();
    const preview = await finance.previewImport(old);
    expect(preview.version).toBe(1);
    await finance.commitImport(preview, {});
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("round-trips all extension records and requires explicit preferences conflicts", async () => {
    await account();
    const goal = await finance.saveGoal({ name: "Travel", target: 50_000 });
    await finance.contribute({ goalId: goal.id, amount: 10_000, date: today() });
    const exported = await finance.exportBackup();
    expect(JSON.parse(exported).version).toBe(2);
    await finance.savePreferences({ ...defaultPreferences, theme: "dark" });
    const preview = await finance.previewImport(exported);
    expect(preview.conflicts.map(row => row.collection)).toEqual(["preferences"]);
    await expect(finance.commitImport(preview, {})).rejects.toThrow("every conflict");
    await finance.commitImport(preview, { [preview.conflicts[0].key]: "current" });
    expect((await finance.getSnapshot()).preferences[0].theme).toBe("dark");
    const again = await finance.previewImport(exported);
    await finance.commitImport(again, { [again.conflicts[0].key]: "incoming" });
    expect((await finance.getSnapshot()).preferences[0].theme).toBe("system");
    expect((await finance.getSnapshot()).contributions[0].amount).toBe(10_000);
  });

  it("requires choices for changed contributions and rejects savings changes after a preview", async () => {
    await account();
    const goal = await finance.saveGoal({ name: "Travel", target: 50_000 });
    await finance.contribute({ goalId: goal.id, amount: 10_000, date: today() });
    const changed = JSON.parse(await finance.exportBackup());
    changed.data.contributions[0].amount = 15_000;
    const preview = await finance.previewImport(JSON.stringify(changed));
    expect(preview.conflicts.map(row => row.collection)).toEqual(["contributions"]);
    await finance.saveGoal({ ...goal, name: "New name" });
    await expect(finance.commitImport(preview, { [preview.conflicts[0].key]: "incoming" })).rejects.toThrow("changed after");
    const retry = await finance.previewImport(JSON.stringify(changed));
    await finance.commitImport(retry, Object.fromEntries(retry.conflicts.map(row => [row.key, "incoming"])));
    expect((await finance.getSnapshot()).contributions[0].amount).toBe(15_000);
  });

  it("rejects orphan contributions, excessive release histories, and denomination mismatch", async () => {
    await account();
    const goal = await finance.saveGoal({ name: "Travel", target: 50_000 });
    await finance.contribute({ goalId: goal.id, amount: 10_000, date: today() });
    const source = JSON.parse(await finance.exportBackup());
    const before = await finance.getSnapshot();
    const orphan = structuredClone(source); orphan.data.goals = [];
    await expect(finance.previewImport(JSON.stringify(orphan))).rejects.toThrow("missing goal");
    const release = structuredClone(source); release.data.contributions[0].amount = -1;
    await expect(finance.previewImport(JSON.stringify(release))).rejects.toThrow("releases");
    const usd = structuredClone(source); usd.currency = "USD"; usd.data.preferences[0].currency = "USD";
    await expect(finance.previewImport(JSON.stringify(usd))).rejects.toThrow("different currency");
    expect(await finance.getSnapshot()).toEqual(before);
  });

  it("does not relabel an empty USD ledger when importing v1 peso records", async () => {
    await finance.savePreferences({ ...defaultPreferences, currency: "USD" });
    const incoming = await finance.getSnapshot();
    incoming.accounts.push({ id: "cash", name: "Peso cash", type: "cash", openingBalance: 100_000, archived: false });
    await expect(finance.previewImport(backup(incoming))).rejects.toThrow("Version-one backups use PHP");
    expect((await finance.getSnapshot()).accounts).toEqual([]);
  });

  it("rejects future contributions through backup parsing and forged previews without changing records", async () => {
    await account();
    const goal = await finance.saveGoal({ name: "Travel", target: 50_000 });
    await finance.contribute({ goalId: goal.id, amount: 10_000, date: today() });
    const before = await finance.getSnapshot();
    const source = JSON.parse(await finance.exportBackup());
    const futureRelease = { id: "future-release", goalId: goal.id, amount: -10_000, date: "9999-01-01" };
    source.data.contributions.push(futureRelease);
    await expect(finance.previewImport(JSON.stringify(source))).rejects.toThrow("future");
    const validPreview = await finance.previewImport(await finance.exportBackup());
    validPreview.incoming.contributions!.push(futureRelease);
    await expect(finance.commitImport(validPreview, {})).rejects.toThrow("future");
    await expect(finance.deleteGoal(goal.id)).rejects.toThrow("Release");
    expect(await finance.getSnapshot()).toEqual(before);
  });
});
