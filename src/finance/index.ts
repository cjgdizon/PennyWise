import { useLiveQuery } from "dexie-react-hooks";
import type {
  Account,
  Bill,
  Budget,
  Category,
  Collection,
  Conflict,
  ConflictChoices,
  ImportPreview,
  Snapshot,
  Transaction,
  TransactionInput,
} from "./types";
import {
  balanceFor,
  isScheduled,
  money,
  occurrences,
  parseMoney,
  safeTotal,
  today,
  validDate,
} from "./rules";
import {
  allTables,
  consistentSnapshot,
  database,
  persistSnapshot,
  readSnapshot,
} from "./storage";
import {
  collections,
  compatible,
  equalRecords,
  parseBackup,
  parseRecord,
  parseSnapshot,
  uniqueKey,
  validateSnapshot,
  type FinancialRecord,
} from "./validation";

export type * from "./types";
export { balanceFor, money, occurrences, parseMoney, safeTotal, today };

type Input<T extends { id: string }> = Omit<T, "id"> & { id?: string };
const defaultCategories: Category[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Food & groceries",
    kind: "expense",
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Transport",
    kind: "expense",
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Home & utilities",
    kind: "expense",
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Shopping",
    kind: "expense",
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    name: "Health",
    kind: "expense",
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    name: "Other expenses",
    kind: "expense",
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    name: "Salary",
    kind: "income",
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000008",
    name: "Freelance",
    kind: "income",
    archived: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000009",
    name: "Other income",
    kind: "income",
    archived: false,
  },
];

function identified<T extends { id?: string }>(input: T): T & { id: string } {
  return { ...input, id: input.id ?? crypto.randomUUID() };
}

async function mutate<T>(change: (snapshot: Snapshot) => T): Promise<T> {
  return database.transaction("rw", allTables, async () => {
    const before = await readSnapshot();
    const after = structuredClone(before);
    const result = change(after);
    validateSnapshot(after);
    await persistSnapshot(before, after);
    return result;
  });
}

function put<T extends { id: string }>(rows: T[], value: T): void {
  const index = rows.findIndex((row) => row.id === value.id);
  if (index < 0) rows.push(value);
  else rows[index] = value;
}

function activeAccount(snapshot: Snapshot, accountId: string): void {
  const account = snapshot.accounts.find((account) => account.id === accountId);
  if (!account || account.archived)
    throw new Error("Choose an active account.");
}

function activeCategory(
  snapshot: Snapshot,
  categoryId: string,
  kind: "income" | "expense",
): void {
  const category = snapshot.categories.find(
    (category) => category.id === categoryId,
  );
  if (!category || category.archived || category.kind !== kind)
    throw new Error(`Choose an active ${kind} category.`);
}

function ensureBillSchedule(
  before: Bill,
  after: Bill,
  transactions: Transaction[],
): void {
  if (
    (before.startDate !== after.startDate ||
      before.recurrence !== after.recurrence) &&
    transactions.some(
      (transaction) =>
        transaction.kind === "expense" && transaction.billId === before.id,
    )
  ) {
    throw new Error(
      "This bill has payment history. End this bill and create a new schedule.",
    );
  }
}

function collisionKey(
  collection: Collection,
  incoming: FinancialRecord,
  current: FinancialRecord,
): string {
  return JSON.stringify([collection, incoming.id, current.id]);
}

function checkImportIdentity(current: Snapshot, incoming: Snapshot): void {
  const allCurrent = new Map<
    string,
    { collection: Collection; row: FinancialRecord }
  >();
  for (const collection of collections)
    for (const row of current[collection])
      allCurrent.set(row.id, { collection, row });
  for (const collection of collections)
    for (const row of incoming[collection]) {
      const existing = allCurrent.get(row.id);
      if (
        existing &&
        (existing.collection !== collection ||
          !compatible(collection, existing.row, row))
      ) {
        throw new Error(
          "A record ID is used for incompatible record types. This backup cannot be combined.",
        );
      }
      if (existing && collection === "transactions") {
        const previous = existing.row as Transaction;
        const next = row as Transaction;
        if (
          previous.kind === "expense" &&
          next.kind === "expense" &&
          (previous.billId !== next.billId || previous.dueDate !== next.dueDate)
        ) {
          throw new Error(
            "An imported transaction changes its bill occurrence link. Keep the original payment identity.",
          );
        }
      }
    }
}

function collisions(
  collection: Collection,
  row: FinancialRecord,
  current: FinancialRecord[],
): FinancialRecord[] {
  const key = uniqueKey(collection, row);
  return current.filter(
    (existing) =>
      existing.id === row.id ||
      (key !== undefined && uniqueKey(collection, existing) === key),
  );
}

function buildPreview(current: Snapshot, incoming: Snapshot): ImportPreview {
  checkImportIdentity(current, incoming);
  const conflicts: Conflict[] = [];
  let added = 0;
  let skipped = 0;
  for (const collection of collections)
    for (const row of incoming[collection]) {
      const matches = collisions(collection, row, current[collection]);
      if (!matches.length) added++;
      else if (matches.length === 1 && equalRecords(matches[0], row)) skipped++;
      else
        for (const existing of matches)
          conflicts.push({
            key: collisionKey(collection, row, existing),
            collection,
            current: existing,
            incoming: row,
          });
    }
  return { revision: current.revision, incoming, conflicts, added, skipped };
}

function resolveImport(
  current: Snapshot,
  preview: ImportPreview,
  choices: ConflictChoices,
): { snapshot: Snapshot; added: number; skipped: number; replaced: number } {
  const snapshot = structuredClone(current);
  let added = 0;
  let skipped = 0;
  let replaced = 0;
  for (const collection of collections) {
    const removedIds = new Set<string>();
    const keptIds = new Set<string>();
    const accepted: FinancialRecord[] = [];
    for (const row of preview.incoming[collection]) {
      const matches = collisions(collection, row, current[collection]);
      if (matches.length === 1 && equalRecords(matches[0], row)) {
        keptIds.add(matches[0].id);
        skipped++;
        continue;
      }
      const matchingChoices = matches.map(
        (existing) => choices[collisionKey(collection, row, existing)],
      );
      if (
        matchingChoices.some(
          (choice) => choice !== "current" && choice !== "incoming",
        )
      )
        throw new Error("Choose which version to keep for every conflict.");
      if (
        matchingChoices.includes("current") &&
        matchingChoices.includes("incoming")
      )
        throw new Error(
          "Overlapping conflicts need the same choice. Keep all current records or use the imported record.",
        );
      if (matchingChoices.includes("current")) {
        for (const existing of matches) keptIds.add(existing.id);
        skipped++;
        continue;
      }
      if (matches.length) replaced++;
      else added++;
      for (const existing of matches) removedIds.add(existing.id);
      accepted.push(row);
    }
    if ([...keptIds].some((id) => removedIds.has(id)))
      throw new Error(
        "Overlapping conflict choices would replace a record you chose to keep. Resolve those conflicts consistently.",
      );
    (snapshot[collection] as FinancialRecord[]) = [
      ...(current[collection] as FinancialRecord[]).filter(
        (existing) => !removedIds.has(existing.id),
      ),
      ...accepted,
    ];
  }
  for (const original of current.bills) {
    const incoming = snapshot.bills.find((bill) => bill.id === original.id);
    if (incoming) ensureBillSchedule(original, incoming, current.transactions);
  }
  validateSnapshot(snapshot);
  return { snapshot, added, skipped, replaced };
}

export const finance = {
  async initialize(): Promise<void> {
    await mutate((snapshot) => {
      if (snapshot.categories.length === 0)
        snapshot.categories = structuredClone(defaultCategories);
    });
  },

  getSnapshot: consistentSnapshot,

  async saveAccount(input: Input<Account>): Promise<Account> {
    const account = parseRecord("accounts", identified(input)) as Account;
    return mutate((snapshot) => {
      put(snapshot.accounts, account);
      return account;
    });
  },

  async saveCategory(input: Input<Category>): Promise<Category> {
    const category = parseRecord("categories", identified(input)) as Category;
    return mutate((snapshot) => {
      put(snapshot.categories, category);
      return category;
    });
  },

  async saveTransaction(input: TransactionInput): Promise<Transaction> {
    const transaction = parseRecord(
      "transactions",
      identified(input),
    ) as Transaction;
    return mutate((snapshot) => {
      const existing = snapshot.transactions.find(
        (row) => row.id === transaction.id,
      );
      if (existing && existing.kind !== transaction.kind)
        throw new Error(
          "The transaction type cannot change. Create a new transaction instead.",
        );
      if (
        existing?.kind === "expense" &&
        existing.billId &&
        (transaction.kind !== "expense" ||
          transaction.billId !== existing.billId ||
          transaction.dueDate !== existing.dueDate)
      )
        throw new Error("The bill occurrence link cannot change.");
      if (transaction.kind === "transfer") {
        activeAccount(snapshot, transaction.fromAccountId);
        activeAccount(snapshot, transaction.toAccountId);
      } else {
        activeAccount(snapshot, transaction.accountId);
        activeCategory(snapshot, transaction.categoryId, transaction.kind);
        if (transaction.kind === "expense" && transaction.billId && !existing)
          throw new Error("Use Pay bill to record a bill payment.");
      }
      put(snapshot.transactions, transaction);
      return transaction;
    });
  },

  async deleteTransaction(transactionId: string): Promise<void> {
    await mutate((snapshot) => {
      snapshot.transactions = snapshot.transactions.filter(
        (transaction) => transaction.id !== transactionId,
      );
    });
  },

  async saveBudget(input: Input<Budget>): Promise<Budget> {
    const budget = parseRecord("budgets", identified(input)) as Budget;
    return mutate((snapshot) => {
      activeCategory(snapshot, budget.categoryId, "expense");
      const existing = snapshot.budgets.find(
        (row) =>
          row.month === budget.month && row.categoryId === budget.categoryId,
      );
      if (existing && !input.id) budget.id = existing.id;
      put(snapshot.budgets, budget);
      return budget;
    });
  },

  async saveBill(input: Input<Bill>): Promise<Bill> {
    const bill = parseRecord("bills", identified(input)) as Bill;
    return mutate((snapshot) => {
      activeCategory(snapshot, bill.categoryId, "expense");
      const existing = snapshot.bills.find((row) => row.id === bill.id);
      if (existing) ensureBillSchedule(existing, bill, snapshot.transactions);
      put(snapshot.bills, bill);
      return bill;
    });
  },

  async archiveAccount(accountId: string): Promise<void> {
    await mutate((snapshot) => {
      const account = snapshot.accounts.find(
        (account) => account.id === accountId,
      );
      if (!account) throw new Error("Account not found.");
      account.archived = true;
    });
  },

  async archiveCategory(categoryId: string): Promise<void> {
    await mutate((snapshot) => {
      const category = snapshot.categories.find(
        (category) => category.id === categoryId,
      );
      if (!category) throw new Error("Category not found.");
      if (
        snapshot.bills.some(
          (bill) => bill.categoryId === categoryId && !bill.archived,
        )
      )
        throw new Error("End bills using this category before archiving it.");
      category.archived = true;
    });
  },

  async archiveBill(billId: string): Promise<void> {
    await mutate((snapshot) => {
      const bill = snapshot.bills.find((bill) => bill.id === billId);
      if (!bill) throw new Error("Bill not found.");
      bill.archived = true;
      bill.endDate = today();
      const paidDates = snapshot.transactions.flatMap((transaction) =>
        transaction.kind === "expense" &&
        transaction.billId === billId &&
        transaction.dueDate
          ? [transaction.dueDate]
          : [],
      );
      bill.endDate = [...paidDates, bill.endDate].sort().at(-1)!;
    });
  },

  async payBill(input: {
    billId: string;
    dueDate: string;
    accountId: string;
    amount: number;
    date: string;
  }): Promise<Transaction> {
    if (!validDate(input.dueDate) || !validDate(input.date))
      throw new Error("Choose valid due and payment dates.");
    return mutate((snapshot) => {
      const bill = snapshot.bills.find((bill) => bill.id === input.billId);
      if (!bill || !isScheduled(bill, input.dueDate))
        throw new Error("This bill occurrence does not exist.");
      const existing = snapshot.transactions.find(
        (transaction) =>
          transaction.kind === "expense" &&
          transaction.billId === input.billId &&
          transaction.dueDate === input.dueDate,
      );
      if (existing) return existing;
      activeAccount(snapshot, input.accountId);
      activeCategory(snapshot, bill.categoryId, "expense");
      const expense = parseRecord("transactions", {
        id: crypto.randomUUID(),
        kind: "expense",
        accountId: input.accountId,
        categoryId: bill.categoryId,
        amount: input.amount,
        date: input.date,
        note: bill.name,
        billId: bill.id,
        dueDate: input.dueDate,
      }) as Transaction;
      snapshot.transactions.push(expense);
      return expense;
    });
  },

  async exportBackup(): Promise<string> {
    const snapshot = await consistentSnapshot();
    return JSON.stringify(
      {
        app: "PennyWise",
        version: 1,
        currency: "PHP",
        exportedAt: new Date().toISOString(),
        data: snapshot,
      },
      null,
      2,
    );
  },

  async previewImport(text: string): Promise<ImportPreview> {
    const incoming = parseBackup(text);
    return buildPreview(await consistentSnapshot(), incoming);
  },

  async commitImport(
    preview: ImportPreview,
    choices: ConflictChoices,
  ): Promise<{ added: number; skipped: number; replaced: number }> {
    const incoming = parseSnapshot(preview.incoming);
    return database.transaction("rw", allTables, async () => {
      const current = await readSnapshot();
      if (current.revision !== preview.revision)
        throw new Error(
          "Your records changed after this preview. Preview the backup again before importing.",
        );
      const currentPreview = buildPreview(current, incoming);
      const result = resolveImport(current, currentPreview, choices);
      await persistSnapshot(current, result.snapshot);
      return {
        added: result.added,
        skipped: result.skipped,
        replaced: result.replaced,
      };
    });
  },
};

export function useFinanceSnapshot(): Snapshot | undefined {
  return useLiveQuery(() => consistentSnapshot(), []);
}
