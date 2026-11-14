export type Account = {
  id: string;
  name: string;
  type: "cash" | "bank" | "ewallet";
  openingBalance: number;
  archived: boolean;
};
export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  archived: boolean;
};
type Entry = { id: string; amount: number; date: string; note: string };
export type Transaction = Entry &
  (
    | { kind: "income"; accountId: string; categoryId: string }
    | {
        kind: "expense";
        accountId: string;
        categoryId: string;
        billId?: string;
        dueDate?: string;
      }
    | { kind: "transfer"; fromAccountId: string; toAccountId: string }
  );
export type Budget = {
  id: string;
  month: string;
  categoryId: string;
  amount: number;
  alertThreshold?: number;
};
export type Currency = "PHP" | "USD";
export type Goal = { id: string; name: string; target: number };
export type Contribution = { id: string; goalId: string; amount: number; date: string };
export type Preferences = {
  id: "preferences";
  name: string;
  currency: Currency;
  theme: "light" | "dark" | "system";
  alerts: boolean;
};
export type Bill = {
  id: string;
  name: string;
  categoryId: string;
  amount: number;
  startDate: string;
  recurrence: "once" | "monthly";
  archived: boolean;
  endDate?: string;
};
export type Snapshot = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  bills: Bill[];
  goals?: Goal[];
  contributions?: Contribution[];
  preferences?: Preferences[];
  revision: number;
};
export type CompleteSnapshot = Snapshot & {
  goals: Goal[];
  contributions: Contribution[];
  preferences: Preferences[];
};
export type Occurrence = {
  bill: Bill;
  dueDate: string;
  paid: boolean;
  transactionId?: string;
};
export type Collection =
  "accounts" | "categories" | "transactions" | "budgets" | "bills" | "goals" | "contributions" | "preferences";
export type Conflict = {
  key: string;
  collection: Collection;
  current: Account | Category | Transaction | Budget | Bill | Goal | Contribution | Preferences;
  incoming: Account | Category | Transaction | Budget | Bill | Goal | Contribution | Preferences;
};
export type ImportPreview = {
  revision: number;
  incoming: Snapshot;
  conflicts: Conflict[];
  added: number;
  skipped: number;
  currency?: Currency;
  version?: 1 | 2;
};
export type ConflictChoices = Record<string, "current" | "incoming">;
export type TransactionInput = Transaction extends infer T
  ? T extends Transaction
    ? Omit<T, "id"> & { id?: string }
    : never
  : never;
