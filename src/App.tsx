import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Home,
  Landmark,
  Leaf,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  Wallet,
  WifiOff,
  X,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import {
  finance,
  useFinanceSnapshot,
  money,
  parseMoney,
  today,
  balanceFor,
  occurrences,
  safeTotal,
} from "./finance";
import type {
  Account,
  Bill,
  Budget,
  Category,
  Conflict,
  ConflictChoices,
  ImportPreview,
  Occurrence,
  Snapshot,
  Transaction,
  TransactionInput,
} from "./finance/types";

type Page =
  "Overview" | "Activity" | "Budgets" | "Bills" | "Accounts" | "Settings";
type Editor =
  | { kind: "transaction"; value?: Transaction }
  | { kind: "account"; value?: Account }
  | { kind: "budget"; value?: Budget }
  | { kind: "bill"; value?: Bill }
  | { kind: "payment"; value: Occurrence }
  | { kind: "category" };
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const navigation: { page: Page; icon: LucideIcon }[] = [
  { page: "Overview", icon: Home },
  { page: "Activity", icon: ArrowLeftRight },
  { page: "Budgets", icon: BookOpen },
  { page: "Bills", icon: Receipt },
  { page: "Accounts", icon: Wallet },
  { page: "Settings", icon: Settings },
];
const titles: Record<Page, string> = {
  Overview: "A little clarity, every day.",
  Activity: "Every little thing, accounted for.",
  Budgets: "Make room for what matters.",
  Bills: "One less thing to remember.",
  Accounts: "Know where your money lives.",
  Settings: "Your money. Your device.",
};
const amountInput = (amount: number) => {
  const cents = BigInt(amount);
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};
const friendlyDate = (date: string) =>
  new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short" }).format(
    new Date(`${date}T12:00:00`),
  );
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(
    new Date(`${month}-01T12:00:00`),
  );
const shiftMonth = (month: string, offset: number) => {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={28} strokeWidth={1.5} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-top">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function EditorForm({
  editor,
  snapshot,
  month,
  done,
  close,
  changed,
}: {
  editor: Editor;
  snapshot: Snapshot;
  month: string;
  done(): void;
  close(): void;
  changed(): void;
}) {
  const [kind, setKind] = useState(
    editor.kind === "transaction"
      ? (editor.value?.kind ?? "expense")
      : "expense",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const accounts = snapshot.accounts.filter(
    (a) =>
      !a.archived ||
      (editor.kind === "transaction" &&
        editor.value &&
        (editor.value.kind === "transfer"
          ? [editor.value.fromAccountId, editor.value.toAccountId].includes(
              a.id,
            )
          : editor.value.accountId === a.id)),
  );
  const value = "value" in editor ? editor.value : undefined;
  const names = {
    transaction: value ? "Edit transaction" : "Add transaction",
    account: value ? "Edit account" : "Add account",
    budget: value ? "Edit budget" : "Set a budget",
    bill: value ? "Edit bill" : "Add a bill",
    payment: "Record bill payment",
    category: "Add a category",
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    try {
      switch (editor.kind) {
        case "account":
          await finance.saveAccount({
            id: editor.value?.id,
            name: text("name"),
            type: text("type") as Account["type"],
            openingBalance: parseMoney(text("openingBalance"), true),
            archived: editor.value?.archived ?? false,
          });
          break;
        case "category":
          await finance.saveCategory({
            name: text("name"),
            kind: text("categoryKind") as Category["kind"],
            archived: false,
          });
          break;
        case "budget":
          await finance.saveBudget({
            id: editor.value?.id,
            month: text("month"),
            categoryId: text("categoryId"),
            amount: parseMoney(text("amount")),
          });
          break;
        case "bill":
          await finance.saveBill({
            id: editor.value?.id,
            name: text("name"),
            categoryId: text("categoryId"),
            amount: parseMoney(text("amount")),
            startDate: text("startDate"),
            recurrence: text("recurrence") as Bill["recurrence"],
            archived: editor.value?.archived ?? false,
            ...(editor.value?.endDate ? { endDate: editor.value.endDate } : {}),
          });
          break;
        case "payment":
          await finance.payBill({
            billId: editor.value.bill.id,
            dueDate: editor.value.dueDate,
            accountId: text("accountId"),
            amount: parseMoney(text("amount")),
            date: text("date"),
          });
          break;
        case "transaction": {
          const base = {
            id: editor.value?.id,
            kind,
            amount: parseMoney(text("amount")),
            date: text("date"),
            note: text("note"),
          };
          const entry =
            kind === "transfer"
              ? {
                  ...base,
                  kind: "transfer",
                  fromAccountId: text("fromAccountId"),
                  toAccountId: text("toAccountId"),
                }
              : {
                  ...base,
                  kind,
                  accountId: text("accountId"),
                  categoryId: text("categoryId"),
                  ...(editor.value?.kind === "expense" && editor.value.billId
                    ? {
                        billId: editor.value.billId,
                        dueDate: editor.value.dueDate,
                      }
                    : {}),
                };
          await finance.saveTransaction(entry as TransactionInput);
          break;
        }
      }
      done();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save. Your previous records are unchanged.",
      );
    } finally {
      setSaving(false);
    }
  };
  const accountSelect = (name: string, label: string, initial?: string) => (
    <label>
      {label}
      <select
        aria-label={label}
        name={name}
        defaultValue={initial ?? accounts[0]?.id}
        required
      >
        {accounts.length === 0 && (
          <option value="">Add an account first</option>
        )}
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
  const categorySelect = (initial?: string, categoryKind = "expense") => (
    <label>
      Category
      <select name="categoryId" defaultValue={initial} required>
        {snapshot.categories
          .filter(
            (c) => c.kind === categoryKind && (!c.archived || c.id === initial),
          )
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
    </label>
  );
  const amount = (initial = 0, name = "amount", label = "Amount (PHP)") => (
    <label>
      {label}
      <input
        name={name}
        inputMode="decimal"
        placeholder="0.00"
        required
        defaultValue={
          initial || name === "openingBalance" ? amountInput(initial) : ""
        }
      />
    </label>
  );
  return (
    <Modal title={names[editor.kind]} close={close}>
      <form onSubmit={submit} onChange={changed}>
        {editor.kind === "transaction" && (
          <>
            <div className="segmented" aria-label="Transaction type">
              {(["expense", "income", "transfer"] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  aria-pressed={kind === type}
                  disabled={
                    Boolean(editor.value) && type !== editor.value?.kind
                  }
                  onClick={() => {
                    setKind(type);
                    changed();
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
            {amount(editor.value?.amount)}
            {kind === "transfer" ? (
              <div className="form-grid">
                {accountSelect(
                  "fromAccountId",
                  "From account",
                  editor.value?.kind === "transfer"
                    ? editor.value.fromAccountId
                    : undefined,
                )}
                {accountSelect(
                  "toAccountId",
                  "To account",
                  editor.value?.kind === "transfer"
                    ? editor.value.toAccountId
                    : accounts[1]?.id,
                )}
              </div>
            ) : (
              <div className="form-grid">
                {accountSelect(
                  "accountId",
                  "Account",
                  editor.value && editor.value.kind !== "transfer"
                    ? editor.value.accountId
                    : undefined,
                )}
                {categorySelect(
                  editor.value && editor.value.kind !== "transfer"
                    ? editor.value.categoryId
                    : undefined,
                  kind,
                )}
              </div>
            )}
            <label>
              Date
              <input
                type="date"
                name="date"
                required
                defaultValue={editor.value?.date ?? today()}
              />
            </label>
            <label>
              Note <span className="optional">optional</span>
              <input
                name="note"
                maxLength={500}
                placeholder="What was it for?"
                defaultValue={editor.value?.note}
              />
            </label>
            {editor.value?.kind === "expense" && editor.value.billId && (
              <p className="field-help">
                Linked to a bill payment. Its scheduled due date stays
                unchanged.
              </p>
            )}
          </>
        )}
        {editor.kind === "account" && (
          <>
            <label>
              Account name
              <input
                name="name"
                placeholder="e.g. Cash, BPI, GCash"
                defaultValue={editor.value?.name}
                required
                maxLength={80}
              />
            </label>
            <label>
              Account type
              <select name="type" defaultValue={editor.value?.type ?? "cash"}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="ewallet">E-wallet</option>
              </select>
            </label>
            {amount(
              editor.value?.openingBalance,
              "openingBalance",
              "Opening balance (PHP)",
            )}
            <p className="field-help">
              The amount you had before your first recorded transaction. It does
              not count as income.
            </p>
          </>
        )}
        {editor.kind === "category" && (
          <>
            <label>
              Category name
              <input
                name="name"
                maxLength={80}
                required
                placeholder="e.g. Pet care"
              />
            </label>
            <label>
              Used for
              <select name="categoryKind">
                <option value="expense">Expenses</option>
                <option value="income">Income</option>
              </select>
            </label>
          </>
        )}
        {editor.kind === "budget" && (
          <>
            <label>
              Month
              <input
                type="month"
                name="month"
                defaultValue={editor.value?.month ?? month}
                required
              />
            </label>
            {categorySelect(editor.value?.categoryId)}
            {amount(editor.value?.amount, "amount", "Monthly limit (PHP)")}
            <p className="field-help">
              Spending is counted by transaction date. Transfers do not use your
              budget.
            </p>
          </>
        )}
        {editor.kind === "bill" && (
          <>
            <label>
              Bill name
              <input
                name="name"
                defaultValue={editor.value?.name}
                placeholder="e.g. Internet"
                maxLength={80}
                required
              />
            </label>
            {amount(editor.value?.amount)}
            {categorySelect(editor.value?.categoryId)}
            <div className="form-grid">
              <label>
                First due date
                <input
                  type="date"
                  name="startDate"
                  defaultValue={editor.value?.startDate ?? today()}
                  required
                />
              </label>
              <label>
                Repeats
                <select
                  name="recurrence"
                  defaultValue={editor.value?.recurrence ?? "monthly"}
                >
                  <option value="monthly">Every month</option>
                  <option value="once">One time</option>
                </select>
              </label>
            </div>
            <p className="field-help">
              For a date like the 31st, shorter months use their last day. End a
              paid bill and create another to change its schedule.
            </p>
          </>
        )}
        {editor.kind === "payment" && (
          <>
            <div className="payment-summary">
              <Receipt size={22} />
              <div>
                <strong>{editor.value.bill.name}</strong>
                <small>Due {friendlyDate(editor.value.dueDate)}</small>
              </div>
            </div>
            {amount(editor.value.bill.amount)}
            {accountSelect("accountId", "Paying account")}
            <label>
              Payment date
              <input type="date" name="date" defaultValue={today()} required />
            </label>
            <p className="field-help">
              This records an expense in PennyWise. It does not send money or
              pay the provider.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="secondary"
            onClick={close}
            disabled={saving}
          >
            Cancel
          </button>
          <button disabled={saving}>
            {saving
              ? "Saving…"
              : editor.kind === "payment"
                ? "Record payment"
                : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function App() {
  const snapshot = useFinanceSnapshot();
  const [initialized, setInitialized] = useState(false);
  const [fatal, setFatal] = useState("");
  const [page, setPage] = useState<Page>("Overview");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [calendarDate, setCalendarDate] = useState(today);
  const [reloadReady, setReloadReady] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<ConflictChoices>({});
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [activityKind, setActivityKind] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [lastExport, setLastExport] = useState(
    () => localStorage.getItem("pennywise-last-export") ?? "",
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ onNeedReload: () => setReloadReady(true) });
  useEffect(() => {
    finance
      .initialize()
      .then(() => setInitialized(true))
      .catch((cause) =>
        setFatal(
          cause instanceof Error ? cause.message : "Storage is unavailable.",
        ),
      );
  }, []);
  useEffect(() => {
    const changed = () =>
      setFatal(
        "PennyWise was updated in another tab. Save any backup you already exported, then reload this tab. Your stored records are intact.",
      );
    window.addEventListener("pennywise-database-updated", changed);
    return () =>
      window.removeEventListener("pennywise-database-updated", changed);
  }, []);
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    const installing = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    window.addEventListener("beforeinstallprompt", installing);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      window.removeEventListener("beforeinstallprompt", installing);
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    const refresh = () => setCalendarDate(today());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  const open = (value: Editor) => {
    setError("");
    setDirty(false);
    setEditor(value);
  };
  const closeEditor = () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setDirty(false);
    setEditor(null);
  };
  const run = async (action: () => Promise<unknown>, success: string) => {
    setError("");
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The action failed. Try again.",
      );
    }
  };
  const exportBackup = async () => {
    const content = await finance.exportBackup();
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `pennywise-backup-${today()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const stamp = new Date().toISOString();
    setLastExport(stamp);
    try {
      localStorage.setItem("pennywise-last-export", stamp);
    } catch {
      /* Backup download does not depend on reminder storage. */
    }
  };
  if (fatal)
    return (
      <main className="recovery">
        <ShieldCheck size={36} />
        <h1>Your records could not be opened.</h1>
        <p>{fatal}</p>
        <p>
          Keep your browser data intact. Close other PennyWise tabs and retry.
        </p>
        <button onClick={() => location.reload()}>Retry</button>
      </main>
    );
  if (!initialized || !snapshot)
    return (
      <main className="recovery" role="status">
        <Leaf size={36} />
        <h1>Opening your money journal…</h1>
        <p>Your records stay on this device.</p>
      </main>
    );
  const date = calendarDate;
  const liveAccounts = snapshot.accounts.filter((a) => !a.archived);
  const transactions = snapshot.transactions.filter(
    (t) => t.date.slice(0, 7) === month,
  );
  const monthIncome = safeTotal(
    transactions.filter((t) => t.kind === "income").map((t) => t.amount),
  );
  const monthExpense = safeTotal(
    transactions.filter((t) => t.kind === "expense").map((t) => t.amount),
  );
  const total = safeTotal(
    snapshot.accounts.map((a) => balanceFor(a, snapshot.transactions)),
  );
  const scheduled = occurrences(
    snapshot.bills,
    snapshot.transactions,
    snapshot.bills.reduce(
      (first, b) => (b.startDate < first ? b.startDate : first),
      date,
    ),
    addDays(date, 30),
  );
  const unpaid = scheduled
    .filter((o) => !o.paid)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const monthBudgets = snapshot.budgets.filter((b) => b.month === month);
  const categoryName = (id: string) =>
    snapshot.categories.find((c) => c.id === id)?.name ?? "Category";
  const recordDetails = (record: Conflict["current"]) => {
    const categories = [
      ...snapshot.categories,
      ...(preview?.incoming.categories ?? []),
    ];
    const accounts = [
      ...snapshot.accounts,
      ...(preview?.incoming.accounts ?? []),
    ];
    const details: string[] = [];
    if ("name" in record) details.push(record.name);
    if ("note" in record && record.note) details.push(record.note);
    if ("kind" in record)
      details.push(
        record.kind === "transfer"
          ? "Account transfer"
          : record.kind === "income"
            ? "Income"
            : "Expense",
      );
    if ("amount" in record) details.push(money(record.amount));
    if ("openingBalance" in record)
      details.push(`Opening balance ${money(record.openingBalance)}`);
    if ("categoryId" in record)
      details.push(
        categories.find((c) => c.id === record.categoryId)?.name ?? "Category",
      );
    if ("accountId" in record)
      details.push(
        accounts.find((a) => a.id === record.accountId)?.name ?? "Account",
      );
    if ("date" in record) details.push(friendlyDate(record.date));
    if ("month" in record) details.push(monthLabel(record.month));
    if ("startDate" in record)
      details.push(`First due ${friendlyDate(record.startDate)}`);
    if ("archived" in record && record.archived) details.push("Archived");
    return details;
  };
  const accountName = (id: string) =>
    snapshot.accounts.find((a) => a.id === id)?.name ?? "Account";
  const recent = [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
  const addTransaction = () =>
    liveAccounts.length
      ? open({ kind: "transaction" })
      : open({ kind: "account" });
  const budgetRows = (limit?: number) =>
    monthBudgets.slice(0, limit).map((b) => {
      const spent = safeTotal(
        transactions
          .filter((t) => t.kind === "expense" && t.categoryId === b.categoryId)
          .map((t) => t.amount),
      );
      const percent = b.amount ? (spent / b.amount) * 100 : 0;
      return (
        <div className="budget-row" key={b.id}>
          <div className="row-between">
            <strong>{categoryName(b.categoryId)}</strong>
            <button
              className="text-button"
              onClick={() => open({ kind: "budget", value: b })}
              aria-label={`Edit ${categoryName(b.categoryId)} budget`}
            >
              <span>
                {money(spent)}{" "}
                <span className="muted">/ {money(b.amount)}</span>
              </span>
              <Pencil size={13} />
            </button>
          </div>
          <progress
            className={percent > 100 ? "over" : ""}
            max={Math.max(b.amount, 1)}
            value={Math.min(spent, b.amount)}
            aria-label={`${categoryName(b.categoryId)} budget used`}
          />
          <div className="row-between small muted">
            <span>
              {spent > b.amount
                ? `${money(spent - b.amount)} over budget`
                : `${money(b.amount - spent)} left`}
            </span>
            <span>{Math.round(percent)}%</span>
          </div>
        </div>
      );
    });
  const transactionRows = (entries: Transaction[]) =>
    entries.map((t) => (
      <div className="transaction-row" key={t.id}>
        <span className={`entry-icon ${t.kind}`}>
          {t.kind === "income" ? (
            <ArrowDownLeft size={18} />
          ) : t.kind === "transfer" ? (
            <ArrowLeftRight size={18} />
          ) : (
            <ArrowUpRight size={18} />
          )}
        </span>
        <div className="entry-copy">
          <strong>
            {t.note ||
              (t.kind === "transfer"
                ? "Account transfer"
                : categoryName(t.categoryId))}
          </strong>
          <small>
            {t.kind === "transfer"
              ? `${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}`
              : `${categoryName(t.categoryId)} · ${accountName(t.accountId)}`}
            {t.kind === "expense" && t.billId ? " · Bill payment" : ""}
          </small>
        </div>
        <div className={`entry-amount ${t.kind}`}>
          <strong>
            {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}
            {money(t.amount)}
          </strong>
          <small>{friendlyDate(t.date)}</small>
        </div>
        {page === "Activity" && (
          <div className="entry-actions">
            <button
              className="icon-button"
              aria-label={`Edit ${t.note || "transaction"}`}
              onClick={() => open({ kind: "transaction", value: t })}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button danger"
              aria-label={`Delete ${t.note || "transaction"}`}
              onClick={() => setPendingDelete(t)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
    ));
  const billRows = (items: Occurrence[]) =>
    items.map((o) => (
      <div className="bill-row" key={`${o.bill.id}:${o.dueDate}`}>
        <div
          className={`bill-day ${!o.paid && o.dueDate < date ? "late" : ""}`}
        >
          <strong>{Number(o.dueDate.slice(8))}</strong>
          <span>
            {new Intl.DateTimeFormat("en-PH", { month: "short" }).format(
              new Date(`${o.dueDate}T12:00:00`),
            )}
          </span>
        </div>
        <div className="entry-copy">
          <strong>{o.bill.name}</strong>
          <small className={!o.paid && o.dueDate < date ? "late-text" : ""}>
            {o.paid
              ? "Paid"
              : o.dueDate < date
                ? "Overdue"
                : o.dueDate === date
                  ? "Due today"
                  : `Due ${friendlyDate(o.dueDate)}`}
          </small>
        </div>
        <div className="bill-action">
          <strong>
            {money(
              o.paid
                ? (snapshot.transactions.find((t) => t.id === o.transactionId)
                    ?.amount ?? o.bill.amount)
                : o.bill.amount,
            )}
          </strong>
          {!o.paid ? (
            <button
              className="text-button"
              disabled={!liveAccounts.length}
              onClick={() => open({ kind: "payment", value: o })}
            >
              Record payment <ArrowRight size={13} />
            </button>
          ) : (
            <span className="paid">
              <Check size={13} /> Paid
            </span>
          )}
        </div>
      </div>
    ));
  const accountList = (compact = false) =>
    snapshot.accounts
      .filter((a) => !compact || !a.archived)
      .map((a) => (
        <div className="account-row" key={a.id}>
          <span className="account-icon">
            {a.type === "bank" ? (
              <Landmark size={20} />
            ) : a.type === "ewallet" ? (
              <Smartphone size={20} />
            ) : (
              <Wallet size={20} />
            )}
          </span>
          <div className="entry-copy">
            <strong>{a.name}</strong>
            <small>
              {a.archived
                ? "Archived"
                : a.type === "ewallet"
                  ? "E-wallet"
                  : a.type === "bank"
                    ? "Bank account"
                    : "Cash on hand"}
            </small>
          </div>
          <strong
            className={
              balanceFor(a, snapshot.transactions) < 0 ? "late-text" : ""
            }
          >
            {money(balanceFor(a, snapshot.transactions))}
          </strong>
          {!compact && (
            <>
              <button
                className="icon-button"
                aria-label={`Edit ${a.name}`}
                onClick={() => open({ kind: "account", value: a })}
              >
                <Pencil size={15} />
              </button>
              {!a.archived && (
                <button
                  className="text-button"
                  onClick={() =>
                    run(
                      () => finance.archiveAccount(a.id),
                      "Account archived. Its history is preserved.",
                    )
                  }
                >
                  Archive
                </button>
              )}
            </>
          )}
        </div>
      ));
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setPage("Overview");
          }}
        >
          <span className="brand-mark">
            <Wallet size={24} strokeWidth={1.7} />
          </span>
          PennyWise<span className="brand-dot">.</span>
        </a>
        <p className="brand-caption">A little wiser, every day.</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ page: item, icon: Icon }) => (
            <button
              key={item}
              className={page === item ? "nav-item active" : "nav-item"}
              onClick={() => setPage(item)}
              aria-current={page === item ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.7} />
              {item}
              {item === "Bills" && unpaid.length > 0 && (
                <span className="nav-count">{unpaid.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Just yours.</strong>
              <p>Your records stay on this device.</p>
            </div>
          </div>
          <button
            className="text-button muted"
            onClick={() => setPage("Settings")}
          >
            <CircleHelp size={15} /> Backup & help
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Your money journal <span>/</span> <strong>{page}</strong>
          </span>
          <div className="topbar-right">
            <span className="device-status">
              {online ? <ShieldCheck size={14} /> : <WifiOff size={14} />}
              {online ? "Stored on this device" : "You are offline"}
            </span>
            <span className="avatar" aria-label="Personal workspace">
              P
            </span>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <p className="date-line">
                {new Intl.DateTimeFormat("en-PH", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "Asia/Manila",
                }).format(new Date())}
              </p>
              <h1>{titles[page]}</h1>
              <p className="page-subtitle">
                {page === "Overview"
                  ? "A clear view of today. A little more room for tomorrow."
                  : page === "Activity"
                    ? "The ins, the outs, and everything in between."
                    : page === "Budgets"
                      ? "Give each category a plan. Adjust it as life happens."
                      : page === "Bills"
                        ? "See what is coming and record what you have paid."
                        : page === "Accounts"
                          ? "Your cash, bank accounts, and e-wallets, together."
                          : "Keep a backup. Take your records with you."}
              </p>
            </div>
            <button className="primary-action" onClick={addTransaction}>
              <Plus size={18} />
              {liveAccounts.length
                ? "Add transaction"
                : "Add your first account"}
            </button>
          </div>
          {error && (
            <div role="alert" className="notice error-notice">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {(needRefresh || reloadReady) && (
            <div className="notice">
              <span>
                {reloadReady
                  ? "The app was updated. Save your work, then reload this tab."
                  : "An app update is ready. Save your work before updating."}
              </span>
              <button
                disabled={Boolean(editor || preview)}
                onClick={() =>
                  reloadReady
                    ? location.reload()
                    : void updateServiceWorker(true)
                }
              >
                {reloadReady ? "Reload app" : "Update app"}
              </button>
            </div>
          )}
          {!snapshot.accounts.length && page === "Overview" && (
            <section className="welcome-strip">
              <span className="welcome-icon">
                <Leaf size={28} />
              </span>
              <div>
                <h2>Start with what you have.</h2>
                <p>
                  Add a cash, bank, or e-wallet account with its current
                  balance. Then record your first transaction.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => open({ kind: "account" })}
              >
                Set up an account <ArrowRight size={16} />
              </button>
            </section>
          )}
          {["Overview", "Activity", "Budgets"].includes(page) && (
            <div className="period-bar">
              <h2>
                {page === "Overview"
                  ? "Your month, so far"
                  : page === "Activity"
                    ? "Transaction history"
                    : "Monthly plan"}
              </h2>
              <div className="month-picker">
                <button
                  className="icon-button"
                  aria-label="Previous month"
                  onClick={() => setMonth(shiftMonth(month, -1))}
                >
                  <ChevronLeft size={17} />
                </button>
                <label className="sr-only" htmlFor="month">
                  Selected month
                </label>
                <input
                  id="month"
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && setMonth(e.target.value)}
                />
                <button
                  className="icon-button"
                  aria-label="Next month"
                  onClick={() => setMonth(shiftMonth(month, 1))}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          )}
          {page === "Overview" && (
            <>
              <section className="balance-band" aria-label="Financial summary">
                <div className="balance-main">
                  <span>Total balance</span>
                  <strong>{money(total)}</strong>
                  <small>
                    Across {snapshot.accounts.length}{" "}
                    {snapshot.accounts.length === 1 ? "account" : "accounts"},
                    including archived balances
                  </small>
                </div>
                <div className="balance-detail">
                  <span>
                    <ArrowDownLeft size={17} /> Income
                  </span>
                  <strong>{money(monthIncome)}</strong>
                  <small>{monthLabel(month)}</small>
                </div>
                <div className="balance-detail">
                  <span>
                    <ArrowUpRight size={17} /> Expenses
                  </span>
                  <strong>{money(monthExpense)}</strong>
                  <small>{monthLabel(month)}</small>
                </div>
                <div className="balance-detail net">
                  <span>Net this month</span>
                  <strong>{money(monthIncome - monthExpense)}</strong>
                  <small>Income minus expenses</small>
                </div>
              </section>
              <div className="dashboard-grid">
                <div className="dashboard-left">
                  <section className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Coming up next</h2>
                        <p>
                          Unpaid bills through {friendlyDate(addDays(date, 30))}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setPage("Bills")}
                      >
                        View bills <ArrowRight size={15} />
                      </button>
                    </div>
                    {unpaid.length ? (
                      billRows(unpaid.slice(0, 3))
                    ) : (
                      <Empty
                        icon={Receipt}
                        title="A little less to remember."
                        action={
                          <button
                            className="text-button"
                            onClick={() => open({ kind: "bill" })}
                          >
                            Add your first bill <Plus size={14} />
                          </button>
                        }
                      >
                        Add due dates for rent, utilities, and subscriptions.
                      </Empty>
                    )}
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Recent activity</h2>
                        <p>The little things add up.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setPage("Activity")}
                      >
                        View all <ArrowRight size={15} />
                      </button>
                    </div>
                    {recent.length ? (
                      transactionRows(recent.slice(0, 5))
                    ) : (
                      <Empty
                        icon={ArrowLeftRight}
                        title="Your journal starts here."
                        action={
                          <button
                            className="text-button"
                            onClick={addTransaction}
                          >
                            Record a transaction <Plus size={14} />
                          </button>
                        }
                      >
                        Your income, spending, and transfers will appear here.
                      </Empty>
                    )}
                  </section>
                </div>
                <div className="dashboard-right">
                  <section className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Budget check-in</h2>
                        <p>Small plans. More breathing room.</p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Add budget"
                        onClick={() => open({ kind: "budget" })}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {monthBudgets.length ? (
                      budgetRows(4)
                    ) : (
                      <Empty
                        icon={BookOpen}
                        title="Give your month a plan."
                        action={
                          <button
                            className="text-button"
                            onClick={() => open({ kind: "budget" })}
                          >
                            Set a budget <ArrowRight size={14} />
                          </button>
                        }
                      >
                        Start with one category you want to keep an eye on.
                      </Empty>
                    )}
                    {monthBudgets.length > 0 && (
                      <button
                        className="wide-link"
                        onClick={() => setPage("Budgets")}
                      >
                        All budgets <ArrowRight size={15} />
                      </button>
                    )}
                  </section>
                  <section className="panel account-panel">
                    <div className="section-heading">
                      <h2>Your accounts</h2>
                      <button
                        className="icon-button"
                        aria-label="Add account"
                        onClick={() => open({ kind: "account" })}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {liveAccounts.length ? (
                      accountList(true)
                    ) : (
                      <p className="muted small">
                        Add an account to see its balance here.
                      </p>
                    )}
                  </section>
                  <div className="gentle-note">
                    <Leaf size={20} />
                    <p>
                      Progress is knowing a little more about your money than
                      you did yesterday.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
          {page === "Activity" && (
            <section className="panel">
              <div className="filter-row">
                <label className="search-label">
                  <span className="sr-only">Search transactions</span>
                  <input
                    placeholder="Search notes, categories, or accounts"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label>
                  <span className="sr-only">Transaction type filter</span>
                  <select
                    value={activityKind}
                    onChange={(e) => setActivityKind(e.target.value)}
                  >
                    <option value="all">All types</option>
                    <option value="expense">Expenses</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfers</option>
                  </select>
                </label>
              </div>
              {(() => {
                const filtered = recent.filter(
                  (t) =>
                    (activityKind === "all" || t.kind === activityKind) &&
                    `${t.note} ${t.kind === "transfer" ? `${accountName(t.fromAccountId)} ${accountName(t.toAccountId)}` : `${categoryName(t.categoryId)} ${accountName(t.accountId)}`}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                );
                return filtered.length ? (
                  transactionRows(filtered)
                ) : (
                  <Empty
                    icon={ArrowLeftRight}
                    title="No transactions here yet."
                  >
                    Try a different month or filter, or record something new.
                  </Empty>
                );
              })()}
            </section>
          )}
          {page === "Budgets" && (
            <section className="panel narrow-panel">
              <div className="section-heading">
                <h2>Category budgets</h2>
                <button
                  className="secondary"
                  onClick={() => open({ kind: "budget" })}
                >
                  <Plus size={16} /> Set budget
                </button>
              </div>
              {monthBudgets.length ? (
                budgetRows()
              ) : (
                <Empty icon={BookOpen} title="A fresh month. A small plan.">
                  Set a monthly category limit to track how much you have left.
                </Empty>
              )}
              <p className="panel-footnote">
                Budgets reset each calendar month. Unused amounts do not roll
                over.
              </p>
            </section>
          )}
          {page === "Bills" && (
            <div className="stack">
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Upcoming & overdue</h2>
                    <p>
                      Through {friendlyDate(addDays(date, 30))}. Records only,
                      no automatic payments.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => open({ kind: "bill" })}
                  >
                    <Plus size={16} /> Add bill
                  </button>
                </div>
                {!liveAccounts.length && (
                  <p className="field-help">
                    Add an account before recording a payment.
                  </p>
                )}
                {unpaid.length ? (
                  billRows(unpaid)
                ) : (
                  <Empty icon={Check} title="Nothing unpaid in view.">
                    Your upcoming and overdue bills will appear here.
                  </Empty>
                )}
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Bill schedules</h2>
                </div>
                {snapshot.bills.map((b) => (
                  <div className="account-row" key={b.id}>
                    <span className="account-icon">
                      <Receipt size={19} />
                    </span>
                    <div className="entry-copy">
                      <strong>{b.name}</strong>
                      <small>
                        {b.archived
                          ? "Ended"
                          : b.recurrence === "monthly"
                            ? "Monthly"
                            : "One time"}{" "}
                        · First due {friendlyDate(b.startDate)}
                      </small>
                    </div>
                    <strong>{money(b.amount)}</strong>
                    <button
                      className="icon-button"
                      aria-label={`Edit ${b.name}`}
                      onClick={() => open({ kind: "bill", value: b })}
                    >
                      <Pencil size={15} />
                    </button>
                    {!b.archived && (
                      <button
                        className="text-button"
                        onClick={() =>
                          run(
                            () => finance.archiveBill(b.id),
                            "Bill schedule ended. Existing records are preserved.",
                          )
                        }
                      >
                        End schedule
                      </button>
                    )}
                  </div>
                ))}
                {!snapshot.bills.length && (
                  <p className="muted">No bill schedules yet.</p>
                )}
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Recent payments</h2>
                </div>
                {scheduled.some((o) => o.paid) ? (
                  billRows(
                    scheduled
                      .filter((o) => o.paid)
                      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
                      .slice(0, 12),
                  )
                ) : (
                  <p className="muted">
                    When you record a bill payment, PennyWise creates a linked
                    expense automatically.
                  </p>
                )}
              </section>
            </div>
          )}
          {page === "Accounts" && (
            <section className="panel">
              <div className="section-heading">
                <h2>All accounts</h2>
                <button
                  className="secondary"
                  onClick={() => open({ kind: "account" })}
                >
                  <Plus size={16} /> Add account
                </button>
              </div>
              {snapshot.accounts.length ? (
                accountList()
              ) : (
                <Empty icon={Wallet} title="Start with one account.">
                  Cash in your wallet is a good place to begin.
                </Empty>
              )}
              <p className="panel-footnote">
                Archived accounts keep their transactions and balances.
                Transfers move money between accounts without counting as
                spending.
              </p>
            </section>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="panel">
                <div className="section-heading">
                  <h2>Back up your journal</h2>
                  <Download size={20} />
                </div>
                <p>
                  Your records live in this browser. Clearing browser data or
                  losing this device can remove them. Export a backup regularly
                  and keep it somewhere safe.
                </p>
                <p className="field-help">
                  {lastExport
                    ? `Last export started ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastExport))}. Check that the file was saved.`
                    : "You have not exported a backup on this device yet."}
                </p>
                <button
                  onClick={() =>
                    run(
                      exportBackup,
                      "Backup download started. Keep the file somewhere safe.",
                    )
                  }
                >
                  <Download size={16} /> Export backup
                </button>
                <p className="panel-footnote">
                  Backups contain your financial records as readable JSON. Keep
                  them private.
                </p>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Combine a backup</h2>
                  <Upload size={20} />
                </div>
                <p>
                  Bring records from a PennyWise backup into this journal.
                  Review additions and choose which version to keep when records
                  conflict.
                </p>
                <p className="field-help">
                  An old backup can bring back records you deleted. Missing
                  records never delete your current records.
                </p>
                <button
                  className="secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} /> Choose backup file
                </button>
                <input
                  ref={fileRef}
                  className="sr-only"
                  type="file"
                  accept=".json,application/json"
                  aria-label="Import backup file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    await run(async () => {
                      if (file.size > 10 * 1024 * 1024)
                        throw new Error("Choose a backup smaller than 10 MB.");
                      setPreview(
                        await finance.previewImport(await file.text()),
                      );
                      setChoices({});
                    }, "Backup ready to review.");
                  }}
                />
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Offline & installation</h2>
                  <Smartphone size={20} />
                </div>
                <p>
                  {offlineReady
                    ? "Ready for offline use. You can reopen PennyWise without an internet connection."
                    : "Offline files are not ready yet. Open the production app online once and wait for its files to finish caching."}
                </p>
                {install ? (
                  <button
                    className="secondary"
                    onClick={async () => {
                      await install.prompt();
                      await install.userChoice;
                      setInstall(null);
                    }}
                  >
                    Install PennyWise
                  </button>
                ) : (
                  <p className="field-help">
                    Use your browser's Install or Add to Home Screen action when
                    available. On iPhone, open Safari and use Share, then Add to
                    Home Screen.
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    run(async () => {
                      const persisted = await navigator.storage?.persist?.();
                      setMessage(
                        persisted
                          ? "Persistent storage granted. Keep exporting backups."
                          : "Persistent storage was not granted. Keep exporting backups regularly.",
                      );
                    }, "")
                  }
                >
                  Request persistent storage <ArrowRight size={14} />
                </button>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Categories</h2>
                  <button
                    className="text-button"
                    onClick={() => open({ kind: "category" })}
                  >
                    <Plus size={15} /> Add
                  </button>
                </div>
                <div className="category-list">
                  {snapshot.categories
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <div className="row-between" key={c.id}>
                        <span>
                          {c.name}
                          <small className="category-kind">{c.kind}</small>
                        </span>
                        <button
                          className="text-button muted"
                          onClick={() =>
                            run(
                              () => finance.archiveCategory(c.id),
                              "Category archived. Its history is preserved.",
                            )
                          }
                        >
                          Archive
                        </button>
                      </div>
                    ))}
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> Small steps. Wiser days.
            </span>
            <span>PHP · No bank connection · Your device only</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ page: item, icon: Icon }) => (
          <button
            key={item}
            className={page === item ? "active" : ""}
            onClick={() => setPage(item)}
            aria-current={page === item ? "page" : undefined}
          >
            <Icon size={19} strokeWidth={1.7} />
            <span>{item}</span>
          </button>
        ))}
      </nav>
      {message && (
        <div className="toast" role="status">
          <Check size={16} />
          {message}
          <button
            aria-label="Dismiss notification"
            className="icon-button"
            onClick={() => setMessage("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {editor && (
        <EditorForm
          key={`${editor.kind}-${"value" in editor ? (editor.value && "id" in editor.value ? editor.value.id : "") : ""}`}
          editor={editor}
          snapshot={snapshot}
          month={month}
          close={closeEditor}
          changed={() => setDirty(true)}
          done={() => {
            setEditor(null);
            setDirty(false);
            setMessage("Saved to this device.");
          }}
        />
      )}
      {pendingDelete && (
        <Modal
          title="Delete this transaction?"
          close={() => setPendingDelete(null)}
        >
          <p>
            This removes {money(pendingDelete.amount)} from your journal and
            recalculates your balances and budgets.
            {pendingDelete.kind === "expense" && pendingDelete.billId
              ? " The linked bill will become unpaid again."
              : ""}
          </p>
          <div className="form-actions">
            <button
              className="secondary"
              onClick={() => setPendingDelete(null)}
            >
              Keep transaction
            </button>
            <button
              className="danger-button"
              onClick={() =>
                run(async () => {
                  await finance.deleteTransaction(pendingDelete.id);
                  setPendingDelete(null);
                }, "Transaction deleted.")
              }
            >
              Delete transaction
            </button>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal
          title="Review your backup"
          close={() => !importing && setPreview(null)}
        >
          <p>
            {preview.added} records to add. {preview.skipped} identical records
            to skip. {preview.conflicts.length} conflicts to resolve.
          </p>
          <p className="field-help">
            Review additions below. Older backups can restore deleted records.
            Current records missing from this backup stay unchanged.
          </p>
          <details>
            <summary>Records in this backup</summary>
            <ul className="import-records">
              {(
                [
                  "accounts",
                  "categories",
                  "transactions",
                  "budgets",
                  "bills",
                ] as const
              ).flatMap((collection) =>
                preview.incoming[collection].map((record) => (
                  <li key={`${collection}:${record.id}`}>
                    <strong>{collection}</strong>{" "}
                    {recordDetails(record).join(" · ")}
                  </li>
                )),
              )}
            </ul>
          </details>
          {preview.conflicts.map((conflict) => (
            <fieldset className="conflict" key={conflict.key}>
              <legend>{conflict.collection} conflict</legend>
              <div className="conflict-version">
                <h3>Current record</h3>
                {recordDetails(conflict.current).map((detail, index) => (
                  <p key={index}>{detail}</p>
                ))}
              </div>
              <div className="conflict-version">
                <h3>Backup record</h3>
                {recordDetails(conflict.incoming).map((detail, index) => (
                  <p key={index}>{detail}</p>
                ))}
              </div>
              <label>
                <input
                  type="radio"
                  name={conflict.key}
                  checked={choices[conflict.key] === "current"}
                  onChange={() =>
                    setChoices({ ...choices, [conflict.key]: "current" })
                  }
                />{" "}
                Keep current
              </label>
              <label>
                <input
                  type="radio"
                  name={conflict.key}
                  checked={choices[conflict.key] === "incoming"}
                  onChange={() =>
                    setChoices({ ...choices, [conflict.key]: "incoming" })
                  }
                />{" "}
                Use imported
              </label>
            </fieldset>
          ))}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="import-actions">
            <button
              className="text-button"
              onClick={() => run(exportBackup, "Current records exported.")}
            >
              Export current records first
            </button>
            <div className="form-actions">
              <button
                className="secondary"
                disabled={importing}
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
              <button
                disabled={
                  importing || preview.conflicts.some((c) => !choices[c.key])
                }
                onClick={async () => {
                  setImporting(true);
                  await run(async () => {
                    const result = await finance.commitImport(preview, choices);
                    setPreview(null);
                    setMessage(
                      `Backup combined. ${result.added} added, ${result.skipped} skipped, ${result.replaced} replaced.`,
                    );
                  }, "");
                  setImporting(false);
                }}
              >
                {importing ? "Combining…" : "Combine records"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
