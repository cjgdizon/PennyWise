import { expect, it } from "vitest";
import { buildCsv } from "./reports";
import type { Snapshot, Transaction } from "./finance/types";
it("escapes formula injection, quotes and line breaks in CSV without losing exact minor units", () => {
  const data: Snapshot = {
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    bills: [],
    revision: 0,
  };
  const row: Transaction = {
    id: "e",
    kind: "expense",
    amount: 1001,
    date: "2026-11-14",
    accountId: "a",
    categoryId: "c",
    note: ' =HYPERLINK("evil")\nnext',
  };
  const csv = buildCsv(data, [row], "PHP");
  expect(csv).toContain('"\' =HYPERLINK(""evil"")\nnext"');
  expect(csv).toContain("10.01");
  expect(buildCsv(data, [], "USD")).toContain("Amount (USD)");
});
