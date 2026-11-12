import type {
  Account,
  Bill,
  Budget,
  Category,
  Collection,
  Snapshot,
  Transaction,
} from "./types";
import { balanceFor, isScheduled, safeTotal, validDate } from "./rules";

export const collections: Collection[] = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "bills",
];
export type FinancialRecord = Account | Category | Transaction | Budget | Bill;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("A backup record is not an object.");
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label} is invalid.`);
  return value;
}

function id(value: unknown): string {
  return text(value, "Record ID", 120);
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Archive status is invalid.");
  return value;
}
function amount(value: unknown, signed = false): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    (!signed && value <= 0)
  )
    throw new Error(
      "Amounts must be safe integer centavos. Transaction amounts must be positive.",
    );
  return value;
}
function date(value: unknown): string {
  if (typeof value !== "string" || !validDate(value))
    throw new Error("Use a valid calendar date in YYYY-MM-DD format.");
  return value;
}
function keys(record: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(record).some((key) => !allowed.includes(key)))
    throw new Error("A record contains unsupported fields.");
}

export function parseRecord(
  collection: Collection,
  value: unknown,
): FinancialRecord {
  const record = object(value);
  const recordId = id(record.id);
  if (collection === "accounts") {
    keys(record, ["id", "name", "type", "openingBalance", "archived"]);
    if (
      record.type !== "cash" &&
      record.type !== "bank" &&
      record.type !== "ewallet"
    )
      throw new Error("Account type is invalid.");
    return {
      id: recordId,
      name: text(record.name, "Account name"),
      type: record.type,
      openingBalance: amount(record.openingBalance, true),
      archived: flag(record.archived),
    };
  }
  if (collection === "categories") {
    keys(record, ["id", "name", "kind", "archived"]);
    if (record.kind !== "income" && record.kind !== "expense")
      throw new Error("Category type is invalid.");
    return {
      id: recordId,
      name: text(record.name, "Category name"),
      kind: record.kind,
      archived: flag(record.archived),
    };
  }
  if (collection === "budgets") {
    keys(record, ["id", "month", "categoryId", "amount"]);
    if (typeof record.month !== "string" || !validDate(`${record.month}-01`))
      throw new Error("Budget month is invalid.");
    return {
      id: recordId,
      month: record.month,
      categoryId: id(record.categoryId),
      amount: amount(record.amount),
    };
  }
  if (collection === "bills") {
    keys(record, [
      "id",
      "name",
      "categoryId",
      "amount",
      "startDate",
      "recurrence",
      "archived",
      "endDate",
    ]);
    if (record.recurrence !== "once" && record.recurrence !== "monthly")
      throw new Error("Bill recurrence is invalid.");
    const bill: Bill = {
      id: recordId,
      name: text(record.name, "Bill name"),
      categoryId: id(record.categoryId),
      amount: amount(record.amount),
      startDate: date(record.startDate),
      recurrence: record.recurrence,
      archived: flag(record.archived),
    };
    if (record.endDate !== undefined) bill.endDate = date(record.endDate);
    if (bill.archived && !bill.endDate)
      throw new Error("An ended bill needs an end date.");
    return bill;
  }
  if (
    record.kind !== "income" &&
    record.kind !== "expense" &&
    record.kind !== "transfer"
  )
    throw new Error("Transaction type is invalid.");
  const base = {
    id: recordId,
    amount: amount(record.amount),
    date: date(record.date),
    note:
      typeof record.note === "string" && record.note.length <= 5000
        ? record.note
        : (() => {
            throw new Error("Transaction note is invalid.");
          })(),
  };
  if (record.kind === "transfer") {
    keys(record, [
      "id",
      "amount",
      "date",
      "note",
      "kind",
      "fromAccountId",
      "toAccountId",
    ]);
    if (record.fromAccountId === record.toAccountId)
      throw new Error("Choose two different accounts for a transfer.");
    return {
      ...base,
      kind: "transfer",
      fromAccountId: id(record.fromAccountId),
      toAccountId: id(record.toAccountId),
    };
  }
  keys(record, [
    "id",
    "amount",
    "date",
    "note",
    "kind",
    "accountId",
    "categoryId",
    ...(record.kind === "expense" ? ["billId", "dueDate"] : []),
  ]);
  const entry = {
    ...base,
    accountId: id(record.accountId),
    categoryId: id(record.categoryId),
  };
  if (record.kind === "expense") {
    if ((record.billId === undefined) !== (record.dueDate === undefined))
      throw new Error("A bill payment needs both its bill and due date.");
    if (record.billId !== undefined)
      return {
        ...entry,
        kind: "expense",
        billId: id(record.billId),
        dueDate: date(record.dueDate),
      };
  }
  return record.kind === "income"
    ? { ...entry, kind: "income" }
    : { ...entry, kind: "expense" };
}

export function parseSnapshot(value: unknown): Snapshot {
  const raw = object(value);
  const result: Snapshot = {
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    bills: [],
    revision: 0,
  };
  let total = 0;
  for (const collection of collections) {
    const rows = raw[collection];
    if (!Array.isArray(rows))
      throw new Error(`Backup ${collection} are missing.`);
    total += rows.length;
    if (total > 100_000)
      throw new Error("This backup contains too many records.");
    const parsed = rows.map((row) => parseRecord(collection, row));
    (result[collection] as FinancialRecord[]) = parsed;
  }
  validateSnapshot(result);
  return result;
}

export function uniqueKey(
  collection: Collection,
  row: FinancialRecord,
): string | undefined {
  if (collection === "budgets") {
    const budget = row as Budget;
    return `${budget.month}:${budget.categoryId}`;
  }
  if (collection === "transactions") {
    const transaction = row as Transaction;
    return transaction.kind === "expense" && transaction.billId
      ? `${transaction.billId}:${transaction.dueDate}`
      : undefined;
  }
}

export function equalRecords(a: FinancialRecord, b: FinancialRecord): boolean {
  const canonical = (record: FinancialRecord) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(record)
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
  return canonical(a) === canonical(b);
}

export function compatible(
  collection: Collection,
  a: FinancialRecord,
  b: FinancialRecord,
): boolean {
  return (
    collection !== "transactions" ||
    (a as Transaction).kind === (b as Transaction).kind
  );
}

export function validateSnapshot(snapshot: Snapshot): void {
  const globalIds = new Set<string>();
  for (const collection of collections) {
    const businessKeys = new Set<string>();
    for (const row of snapshot[collection]) {
      if (globalIds.has(row.id))
        throw new Error("Record IDs must be unique across the backup.");
      globalIds.add(row.id);
      const businessKey = uniqueKey(collection, row);
      if (businessKey && businessKeys.has(businessKey))
        throw new Error(
          `Duplicate ${collection === "budgets" ? "category budget" : "bill payment"} found.`,
        );
      if (businessKey) businessKeys.add(businessKey);
    }
  }
  const accounts = new Map(snapshot.accounts.map((row) => [row.id, row]));
  const categories = new Map(snapshot.categories.map((row) => [row.id, row]));
  const bills = new Map(snapshot.bills.map((row) => [row.id, row]));
  for (const budget of snapshot.budgets) {
    if (categories.get(budget.categoryId)?.kind !== "expense")
      throw new Error("A budget must refer to an existing expense category.");
  }
  for (const bill of snapshot.bills) {
    if (categories.get(bill.categoryId)?.kind !== "expense")
      throw new Error("A bill must refer to an existing expense category.");
  }
  for (const transaction of snapshot.transactions) {
    if (transaction.kind === "transfer") {
      if (
        !accounts.has(transaction.fromAccountId) ||
        !accounts.has(transaction.toAccountId)
      )
        throw new Error("A transfer refers to a missing account.");
    } else {
      if (!accounts.has(transaction.accountId))
        throw new Error("A transaction refers to a missing account.");
      if (categories.get(transaction.categoryId)?.kind !== transaction.kind)
        throw new Error("The transaction category does not match its type.");
      if (transaction.kind === "expense" && transaction.billId) {
        const bill = bills.get(transaction.billId);
        if (
          !bill ||
          !transaction.dueDate ||
          !isScheduled(bill, transaction.dueDate)
        )
          throw new Error(
            "A bill payment refers to an invalid scheduled occurrence.",
          );
      }
    }
  }
  safeTotal(
    snapshot.accounts.map((account) =>
      balanceFor(account, snapshot.transactions),
    ),
  );
  safeTotal(
    snapshot.accounts
      .filter((account) => !account.archived)
      .map((account) => balanceFor(account, snapshot.transactions)),
  );
  safeTotal(
    snapshot.transactions
      .filter((row) => row.kind === "income")
      .map((row) => row.amount),
  );
  safeTotal(
    snapshot.transactions
      .filter((row) => row.kind === "expense")
      .map((row) => row.amount),
  );
  safeTotal(snapshot.budgets.map((row) => row.amount));
  safeTotal(snapshot.bills.map((row) => row.amount));
}

export function parseBackup(text: string): Snapshot {
  if (text.length > 10_000_000)
    throw new Error("Choose a backup smaller than 10 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const root = object(parsed);
  if (root.app !== "PennyWise" || root.version !== 1 || root.currency !== "PHP")
    throw new Error("Choose a supported PennyWise PHP backup, version 1.");
  return parseSnapshot(root.data);
}
