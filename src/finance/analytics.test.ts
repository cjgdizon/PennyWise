import { describe, expect, it } from "vitest";
import { deriveDashboard, filterTransactions } from "./analytics";
import type { Snapshot } from "./types";
const snapshot = (): Snapshot => ({
  accounts: [
    {
      id: "a",
      name: "Cash",
      type: "cash",
      openingBalance: 100000,
      archived: true,
    },
  ],
  categories: [{ id: "food", name: "Food", kind: "expense", archived: false }],
  transactions: [],
  budgets: [{ id: "b", month: "2026-11", categoryId: "food", amount: 50000 }],
  bills: [],
  revision: 0,
});
describe("dashboard finance definitions", () => {
  it("counts archived balances, all spending, reservations and overdue unpaid bills without future income", () => {
    const data = snapshot();
    data.transactions = [
      {
        id: "e",
        kind: "expense",
        amount: 10000,
        date: "2026-11-10",
        note: "",
        accountId: "a",
        categoryId: "food",
      },
      {
        id: "future",
        kind: "income",
        amount: 900000,
        date: "2026-11-30",
        note: "",
        accountId: "a",
        categoryId: "salary",
      },
    ];
    data.bills = [
      {
        id: "bill",
        name: "Old bill",
        categoryId: "food",
        amount: 60000,
        startDate: "2026-10-01",
        recurrence: "once",
        archived: false,
      },
    ];
    Object.assign(data, {
      contributions: [
        { id: "c", goalId: "g", amount: 15000, date: "2026-11-01" },
      ],
    });
    expect(deriveDashboard(data, "2026-11", "2026-11-14")).toMatchObject({
      balance: 90000,
      income: 0,
      expenses: 10000,
      net: -10000,
      remaining: 40000,
      reserved: 15000,
      unpaidBills: 60000,
      safeToSpend: 15000,
    });
    data.transactions.push({
      id: "paid",
      kind: "expense",
      amount: 60000,
      date: "2026-11-12",
      note: "",
      accountId: "a",
      categoryId: "food",
      billId: "bill",
      dueDate: "2026-10-01",
    });
    expect(deriveDashboard(data, "2026-11", "2026-11-14")).toMatchObject({
      unpaidBills: 0,
      safeToSpend: 0,
    });
    data.transactions.find((transaction) => transaction.id === "paid")!.date = "2026-11-15";
    expect(deriveDashboard(data, "2026-11", "2026-11-14")).toMatchObject({
      unpaidBills: 60000,
      safeToSpend: 15000,
    });
  });
  it("does not invent an allowance without budgets or in historical months", () => {
    const data = snapshot();
    data.budgets = [];
    expect(deriveDashboard(data, "2026-11", "2026-11-14")).toMatchObject({
      remaining: null,
      safeToSpend: null,
    });
    expect(
      deriveDashboard(snapshot(), "2026-11", "2026-12-14").safeToSpend,
    ).toBeNull();
  });
  it("allocates weekly targets without losing minor units", () => {
    const data = snapshot();
    data.budgets[0].amount = Number.MAX_SAFE_INTEGER;
    const result = deriveDashboard(data, "2026-11", "2026-11-14");
    expect(
      result.weekly.reduce((sum, row) => sum + BigInt(row.target), 0n),
    ).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });
  it("filters inclusively and excludes transfers when a category is selected", () => {
    const data = snapshot();
    data.transactions = [
      {
        id: "e",
        kind: "expense",
        amount: 100,
        date: "2026-11-01",
        note: "",
        accountId: "a",
        categoryId: "food",
      },
      {
        id: "t",
        kind: "transfer",
        amount: 100,
        date: "2026-11-01",
        note: "",
        fromAccountId: "a",
        toAccountId: "b",
      },
    ];
    expect(
      filterTransactions(data, {
        from: "2026-11-01",
        to: "2026-11-01",
        kind: "all",
        categoryId: "food",
      }).map((t) => t.id),
    ).toEqual(["e"]);
    expect(
      filterTransactions(data, {
        from: "2026-12-01",
        to: "2026-11-01",
        kind: "all",
        categoryId: "",
      }),
    ).toEqual([]);
  });
});
