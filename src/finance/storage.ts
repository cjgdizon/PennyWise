import Dexie from "dexie";
import type {
  Account,
  Bill,
  Budget,
  Category,
  Snapshot,
  Transaction,
} from "./types";
import { collections, equalRecords, type FinancialRecord } from "./validation";

type StoredTransaction = Transaction & { occurrenceKey?: string };
type Meta = { key: string; value: number };
export const database = new Dexie("pennywise");
database.version(1).stores({
  accounts: "id",
  categories: "id",
  transactions: "id, date, &occurrenceKey",
  budgets: "id, &[month+categoryId]",
  bills: "id",
  meta: "key",
});

const accounts = database.table<Account, string>("accounts");
const categories = database.table<Category, string>("categories");
const transactions = database.table<StoredTransaction, string>("transactions");
const budgets = database.table<Budget, string>("budgets");
const bills = database.table<Bill, string>("bills");
const meta = database.table<Meta, string>("meta");
export const allTables = [
  accounts,
  categories,
  transactions,
  budgets,
  bills,
  meta,
];

database.on("versionchange", () => {
  database.close();
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("pennywise-database-updated"));
});

export async function readSnapshot(): Promise<Snapshot> {
  const [
    accountRows,
    categoryRows,
    transactionRows,
    budgetRows,
    billRows,
    revision,
  ] = await Promise.all([
    accounts.toArray(),
    categories.toArray(),
    transactions.toArray(),
    budgets.toArray(),
    bills.toArray(),
    meta.get("revision"),
  ]);
  return {
    accounts: accountRows,
    categories: categoryRows,
    transactions: transactionRows.map(
      ({ occurrenceKey: _key, ...transaction }) => transaction as Transaction,
    ),
    budgets: budgetRows,
    bills: billRows,
    revision: revision?.value ?? 0,
  };
}

export async function persistSnapshot(
  before: Snapshot,
  after: Snapshot,
): Promise<boolean> {
  let changed = false;
  for (const collection of collections) {
    const table = database.table<
      FinancialRecord & { occurrenceKey?: string },
      string
    >(collection);
    const previous = new Map<string, FinancialRecord>(
      before[collection].map((record) => [record.id, record]),
    );
    const next = new Map<string, FinancialRecord>(
      after[collection].map((record) => [record.id, record]),
    );
    const removed = [...previous.keys()].filter(
      (recordId) => !next.has(recordId),
    );
    const writes = [...next.values()].filter(
      (record) =>
        !previous.has(record.id) ||
        !equalRecords(record, previous.get(record.id)!),
    );
    if (removed.length || writes.length) changed = true;
    await table.bulkDelete(removed);
    // Delete changed rows first so two explicitly resolved unique keys can swap atomically.
    await table.bulkDelete(writes.map((record) => record.id));
    await table.bulkPut(
      writes.map((record) => {
        const entry = record as Transaction;
        return collection === "transactions" &&
          entry.kind === "expense" &&
          entry.billId
          ? { ...record, occurrenceKey: `${entry.billId}:${entry.dueDate}` }
          : record;
      }),
    );
  }
  if (changed) await meta.put({ key: "revision", value: before.revision + 1 });
  return changed;
}

export function consistentSnapshot(): Promise<Snapshot> {
  return database.transaction("r", allTables, readSnapshot);
}
