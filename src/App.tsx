import { useEffect, useState, type ReactNode } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  BookOpen,
  Receipt,
  Settings,
  Plus,
  MoreHorizontal,
  PiggyBank,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  Download,
  ShieldCheck,
  WifiOff,
  ShoppingBag,
  Film,
  Utensils,
  Bus,
  Heart,
  House,
  Briefcase,
  Tag,
  X,
  Check,
  type LucideIcon,
} from "lucide-react";
import {
  finance,
  useFinanceSnapshot,
  money,
  today,
  balanceFor,
  occurrences,
  safeTotal,
  defaultPreferences,
} from "./finance";
import {
  deriveDashboard,
  filterTransactions,
  monthEnd,
  type ReportFilter,
} from "./finance/analytics";
import type { Transaction } from "./finance/types";
import { EditorSheet, type Editor } from "./components/EditorSheet";
import {
  Panel,
  Amount,
  Empty,
  Progress,
  Sheet,
  button,
  primary,
  input,
} from "./components/ui";
import { DashboardCharts } from "./components/DashboardCharts";
import { PreferencesScreen } from "./components/PreferencesScreen";
import { buildCsv, downloadText, printReport } from "./reports";
type Page =
  | "Overview"
  | "Transactions"
  | "Budgets"
  | "Savings"
  | "Reports"
  | "Bills"
  | "Accounts"
  | "Settings";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const navigation: { page: Page; icon: LucideIcon }[] = [
  { page: "Overview", icon: LayoutDashboard },
  { page: "Transactions", icon: ArrowLeftRight },
  { page: "Budgets", icon: BookOpen },
  { page: "Savings", icon: PiggyBank },
  { page: "Reports", icon: ChartNoAxesCombined },
  { page: "Bills", icon: Receipt },
  { page: "Accounts", icon: Wallet },
  { page: "Settings", icon: Settings },
];
const subtitles: Record<Page, string> = {
  Overview: "Your money, with a clearer perspective.",
  Transactions: "Every move. All in one place.",
  Budgets: "Give every category a little direction.",
  Savings: "Small steps toward something bigger.",
  Reports: "A closer look at your money.",
  Bills: "Stay ahead of what is coming.",
  Accounts: "Your money, wherever you keep it.",
  Settings: "Make this space your own.",
};
function shiftMonth(month: string, offset: number) {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
function CategoryBadge({ name }: { name: string }) {
  const n = name.toLowerCase();
  const [Icon, color]: [LucideIcon, string] = /food|grocer|dining/.test(n)
    ? [
        Utensils,
        "bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
      ]
    : /transport|travel/.test(n)
      ? [Bus, "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200"]
      : /home|utilit/.test(n)
        ? [
            House,
            "bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
          ]
        : /entertain|cinema|movie/.test(n)
          ? [
              Film,
              "bg-fuchsia-50 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
            ]
          : /health/.test(n)
            ? [
                Heart,
                "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
              ]
            : /shop/.test(n)
              ? [
                  ShoppingBag,
                  "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
                ]
              : /salary|freelance|income/.test(n)
                ? [
                    Briefcase,
                    "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
                  ]
                : [Tag, "bg-[var(--hover)] text-[var(--muted)]"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] ${color}`}
    >
      <Icon size={12} />
      {name}
    </span>
  );
}
function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </div>
  );
}
export default function App() {
  const snapshot = useFinanceSnapshot();
  const [initialized, setInitialized] = useState(false);
  const [fatal, setFatal] = useState("");
  const [page, setPage] = useState<Page>("Overview");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [asOf, setAsOf] = useState(today());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [more, setMore] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [reloadReady, setReloadReady] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [hasOfflineWorker, setHasOfflineWorker] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState<"all" | "income" | "expense">("all");
  const [report, setReport] = useState<ReportFilter>({
    from: `${today().slice(0, 7)}-01`,
    to: today(),
    kind: "all",
    categoryId: "",
  });
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedReload: () => setReloadReady(true),
    onRegisteredSW: (_url, registration) => setHasOfflineWorker(Boolean(registration?.active)),
  });
  const preferences = snapshot?.preferences?.[0] ?? defaultPreferences;
  useEffect(() => {
    void finance
      .initialize()
      .then(() => setInitialized(true))
      .catch((c) =>
        setFatal(c instanceof Error ? c.message : "Storage unavailable."),
      );
  }, []);
  useEffect(() => {
    const changed = () =>
      setFatal(
        "PennyWise was updated in another tab. Reload this tab before continuing. Your stored records are intact.",
      );
    window.addEventListener("pennywise-database-updated", changed);
    return () =>
      window.removeEventListener("pennywise-database-updated", changed);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.classList.toggle(
        "dark",
        preferences.theme === "dark" ||
          (preferences.theme === "system" && media.matches),
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences.theme]);
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    const installing = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const refresh = () => setAsOf(today());
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    window.addEventListener("beforeinstallprompt", installing);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      window.removeEventListener("beforeinstallprompt", installing);
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() !== "n" ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        editor ||
        more ||
        document.querySelector("dialog[open]")
      )
        return;
      const target = e.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable]")) return;
      e.preventDefault();
      setEditor({ kind: "transaction" });
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [editor, more]);
  useEffect(() => {
    if (!editor && !importOpen) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [editor, importOpen]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const open = (e: Editor) => {
    setError("");
    setEditor(e);
  };
  const run = async (action: () => Promise<unknown>, success: string) => {
    setError("");
    try {
      await action();
      setMessage(success);
    } catch (c) {
      setError(
        c instanceof Error ? c.message : "The action failed. Please retry.",
      );
    }
  };
  const navigate = (next: Page) => {
    setPage(next);
    setMore(false);
    setQuery("");
    setCategory("");
    setKind("all");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  if (fatal)
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <ShieldCheck size={32} />
        <h1 className="mt-5 text-2xl font-semibold">
          Your records could not be opened
        </h1>
        <p className="my-5 text-sm leading-6 text-[var(--muted)]">{fatal}</p>
        <button className={primary} onClick={() => location.reload()}>
          Reload app
        </button>
      </main>
    );
  if (!initialized || !snapshot)
    return (
      <main
        aria-busy="true"
        aria-label="Loading PennyWise"
        className="mx-auto max-w-6xl animate-pulse p-8 motion-reduce:animate-none"
      >
        <div className="mb-8 h-9 w-48 rounded bg-[var(--hover)]" />
        <div className="grid gap-5 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-[var(--hover)]" />
          ))}
        </div>
        <div className="mt-6 h-72 rounded-xl bg-[var(--hover)]" />
        <span className="sr-only">Loading your records…</span>
      </main>
    );
  const currency = preferences.currency;
  const cash = (n: number) => money(n, currency);
  const data = deriveDashboard(snapshot, month, asOf);
  const budgets = snapshot.budgets.filter((b) => b.month === month);
  const activity = snapshot.transactions
    .filter(
      (t) =>
        t.date.startsWith(month) &&
        (kind === "all" || t.kind === kind) &&
        (!category || (t.kind !== "transfer" && t.categoryId === category)) &&
        `${t.note} ${t.kind === "transfer" ? "Transfer" : (snapshot.categories.find((c) => c.id === t.categoryId)?.name ?? "")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const spent = (id: string) =>
    data.categories.find((c) => c.category.id === id)?.amount ?? 0;
  const current = month === asOf.slice(0, 7);
  const pending = occurrences(
    snapshot.bills,
    snapshot.transactions.filter((transaction) => transaction.date <= asOf),
    snapshot.bills.reduce(
      (d, b) => (b.startDate < d ? b.startDate : d),
      `${month}-01`,
    ),
    monthEnd(month),
  ).filter((o) => !o.paid);
  const monthlyBills = occurrences(
    snapshot.bills,
    snapshot.transactions.filter((transaction) => transaction.date <= asOf),
    `${month}-01`,
    monthEnd(month),
  );
  const unbudgeted = data.categories.filter(
    (c) => c.amount > 0 && !budgets.some((b) => b.categoryId === c.category.id),
  );
  const monthPicker = (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <button
        aria-label="Previous month"
        className="flex h-11 w-10 items-center justify-center rounded-lg hover:bg-[var(--hover)]"
        onClick={() => setMonth(shiftMonth(month, -1))}
      >
        <ChevronLeft size={16} />
      </button>
      <input
        type="month"
        aria-label="Selected month"
        className="min-h-11 min-w-0 w-36 bg-transparent text-sm font-medium"
        value={month}
        onChange={(e) => {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
            setMonth(e.target.value);
        }}
      />
      <button
        aria-label="Next month"
        className="flex h-11 w-10 items-center justify-center rounded-lg hover:bg-[var(--hover)]"
        onClick={() => setMonth(shiftMonth(month, 1))}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
  const transactionRows = (rows: Transaction[]) =>
    rows.length ? (
      <div className="divide-y divide-[var(--line)]">
        {rows.map((t) => {
          const cat =
            t.kind === "transfer"
              ? "Transfer"
              : (snapshot.categories.find((c) => c.id === t.categoryId)?.name ??
                "Category");
          const account =
            t.kind === "transfer"
              ? `${snapshot.accounts.find((a) => a.id === t.fromAccountId)?.name} → ${snapshot.accounts.find((a) => a.id === t.toAccountId)?.name}`
              : snapshot.accounts.find((a) => a.id === t.accountId)?.name;
          const Icon =
            t.kind === "income"
              ? ArrowDownLeft
              : t.kind === "expense"
                ? ArrowUpRight
                : ArrowLeftRight;
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-3 py-4">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${t.kind === "income" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-[var(--hover)] text-[var(--muted)]"}`}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">
                  {t.note || cat}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <CategoryBadge name={cat} />
                  <span className="max-w-44 truncate text-[11px] text-[var(--muted)]">
                    {account}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <Amount
                  className={`text-xs font-semibold sm:text-sm ${t.kind === "income" ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                >
                  {t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}
                  {cash(t.amount)}
                </Amount>
                <p className="mt-1 font-mono tabular-nums text-[11px] text-[var(--muted)]">
                  {dateLabel(t.date)}
                  {t.date > asOf ? " · Scheduled" : ""}
                </p>
              </div>
              <div className="flex gap-1 max-sm:ml-auto">
                <button
                  aria-label={`Edit ${t.note || cat}`}
                  className="flex h-11 w-10 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)]"
                  onClick={() => open({ kind: "transaction", value: t })}
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={`Delete ${t.note || cat}`}
                  className="flex h-11 w-10 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)]"
                  onClick={() => {
                    if (
                      confirm(
                        "Delete this transaction? Bill payments become unpaid again.",
                      )
                    )
                      void run(
                        () => finance.deleteTransaction(t.id),
                        "Transaction deleted",
                      );
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <Empty
        title="No transactions here"
        action={
          <button
            className={primary}
            onClick={() => open({ kind: "transaction" })}
          >
            <Plus size={16} />
            Log transaction
          </button>
        }
      >
        Try another filter, or record your next money move.
      </Empty>
    );
  const filters = (
    <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_160px]">
      <label className="relative min-w-0">
        <Search
          size={16}
          className="absolute left-3 top-3.5 text-[var(--muted)]"
        />
        <input
          aria-label="Search transactions"
          className={`${input} min-w-0 pl-10!`}
          placeholder="Search transactions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <select
        aria-label="Transaction type"
        className={input}
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
      >
        <option value="all">All types</option>
        <option value="income">Income</option>
        <option value="expense">Expenses</option>
      </select>
      <select
        aria-label="Transaction category"
        className={input}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">All categories</option>
        {snapshot.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
  const budgetCards = (limit?: number) => (
    <div
      className={`grid gap-4 ${limit ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}
    >
      {budgets.slice(0, limit).map((b) => {
        const used = spent(b.categoryId);
        const percent = (used / b.amount) * 100;
        const threshold = b.alertThreshold ?? 80;
        const status =
          percent >= 100
            ? "Over limit"
            : percent >= threshold && preferences.alerts
              ? "Approaching limit"
              : "On track";
        return (
          <Panel key={b.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <CategoryBadge
                name={
                  snapshot.categories.find((c) => c.id === b.categoryId)
                    ?.name ?? "Category"
                }
              />
              <button
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[var(--hover)]"
                aria-label={`Edit ${snapshot.categories.find((c) => c.id === b.categoryId)?.name} budget`}
                onClick={() => open({ kind: "budget", value: b })}
              >
                <Pencil size={15} />
              </button>
            </div>
            <div className="mb-4 mt-3 flex flex-wrap items-baseline justify-between gap-2">
              <Amount className="text-lg font-semibold">{cash(used)}</Amount>
              <span className="text-xs text-[var(--muted)]">
                of <Amount>{cash(b.amount)}</Amount>
              </span>
            </div>
            <Progress
              value={percent}
              threshold={threshold}
              label="Budget used"
            />
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
              <span
                className={
                  percent >= 100
                    ? "text-rose-700 dark:text-rose-300"
                    : percent >= threshold && preferences.alerts
                      ? "text-amber-800 dark:text-amber-300"
                      : "text-emerald-700 dark:text-emerald-400"
                }
              >
                {status}
              </span>
              <Amount>{cash(b.amount - used)} left</Amount>
            </div>
            {!limit && (
              <p className="mt-4 text-xs text-[var(--muted)]">
                Alert at {threshold}% · {Math.round(percent)}% used
              </p>
            )}
          </Panel>
        );
      })}
    </div>
  );
  const billList = (compact = false) => {
    const rows = compact ? pending.slice(0, 4) : monthlyBills;
    return rows.length ? (
      <div className="divide-y divide-[var(--line)]">
        {rows.map((o) => (
          <div
            key={`${o.bill.id}-${o.dueDate}`}
            className="flex items-center gap-3 py-4"
          >
            <div
              className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-xs ${!o.paid && o.dueDate < asOf ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-[var(--hover)]"}`}
            >
              <span className="font-mono text-base font-semibold">
                {o.dueDate.slice(8)}
              </span>
              <span className="text-[9px]">
                {dateLabel(o.dueDate).split(" ")[0]}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{o.bill.name}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {o.paid ? "Paid" : o.dueDate < asOf ? "Overdue" : "Due"} ·{" "}
                {dateLabel(o.dueDate)}
              </p>
            </div>
            <div className="text-right">
              <Amount className="text-xs font-semibold sm:text-sm">
                {cash(
                  o.paid
                    ? (snapshot.transactions.find(
                        (t) => t.id === o.transactionId,
                      )?.amount ?? o.bill.amount)
                    : o.bill.amount,
                )}
              </Amount>
              {o.paid ? (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                  Paid
                </p>
              ) : (
                <button
                  className="block min-h-11 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                  onClick={() => open({ kind: "payment", value: o })}
                >
                  Record payment
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty title="All clear">
        No{" "}
        {compact
          ? "unpaid bills due by month end"
          : "bills scheduled for this month"}
        .
      </Empty>
    );
  };
  const reports = filterTransactions(snapshot, report);
  const reportIncome = safeTotal(
    reports.filter((t) => t.kind === "income").map((t) => t.amount),
  );
  const reportExpenses = safeTotal(
    reports.filter((t) => t.kind === "expense").map((t) => t.amount),
  );
  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--text)]">
      <a
        href="#main"
        className="fixed -top-20 left-4 z-50 rounded-lg bg-emerald-700 px-4 py-3 text-white focus:top-4"
      >
        Skip to content
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-[var(--line)] bg-[var(--panel)] px-4 py-6 md:flex ${collapsed ? "w-20" : "w-60"}`}
      >
        <div
          className={`flex items-center gap-3 px-2 ${collapsed ? "justify-center" : ""}`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <Wallet size={20} />
          </span>
          {!collapsed && (
            <span className="text-xl font-bold tracking-tight">
              PennyWise<span className="text-emerald-600">.</span>
            </span>
          )}
        </div>
        <nav aria-label="Main navigation" className="mt-10 space-y-1.5">
          {navigation.map(({ page: p, icon: Icon }) => (
            <button
              key={p}
              title={collapsed ? p : undefined}
              aria-label={p}
              aria-current={page === p ? "page" : undefined}
              onClick={() => navigate(p)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium ${collapsed ? "justify-center" : ""} ${page === p ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "text-[var(--muted)] hover:bg-[var(--hover)]"}`}
            >
              <Icon size={18} />
              {!collapsed && p}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-4 pt-8">
          {!collapsed && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4">
              <ShieldCheck size={19} className="text-emerald-600" />
              <p className="mt-2 text-xs font-semibold">
                Your money. Your device.
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                Private by default. Back up regularly.
              </p>
            </div>
          )}
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`${button} w-full px-2!`}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <>
                <PanelLeftClose size={18} />
                Collapse sidebar
              </>
            )}
          </button>
        </div>
      </aside>
      <div className={collapsed ? "md:pl-20" : "md:pl-60"}>
        <header className="flex h-16 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-5 sm:px-8">
          <span className="text-xs text-[var(--muted)]">
            <span className="md:hidden font-bold text-[var(--text)]">
              PennyWise
            </span>
            <span className="hidden md:inline">
              Workspace / <span className="text-[var(--text)]">{page}</span>
            </span>
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              {online ? <ShieldCheck size={14} /> : <WifiOff size={14} />}
              <span className="hidden sm:inline">
                {online ? "Stored on this device" : "Offline"}
              </span>
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              {preferences.name?.slice(0, 1).toUpperCase() || "P"}
            </span>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto max-w-[1600px] px-4 py-6 pb-28 sm:px-8 lg:py-8"
        >
          <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="mb-2 text-xs text-[var(--muted)]">
                {new Date(`${asOf}T12:00:00`).toLocaleDateString("en-PH", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {page}
              </h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {subtitles[page]}
              </p>
            </div>
            <button
              className={`${primary} hidden! sm:inline-flex!`}
              onClick={() => open({ kind: "transaction" })}
            >
              <Plus size={17} />
              Log transaction
              <span
                aria-hidden="true"
                className="ml-2 hidden rounded border border-white/30 px-1.5 text-[10px] lg:inline"
              >
                N
              </span>
            </button>
          </div>
          {(needRefresh || reloadReady) && (
            <Panel className="mb-5 flex flex-wrap items-center justify-between gap-4 p-4">
              <p className="text-sm">
                {reloadReady
                  ? "The app was updated. Save your work, then reload this tab."
                  : "A new version is ready. Save your work before updating."}
              </p>
              <button
                disabled={!!editor || importOpen}
                className={button}
                onClick={() =>
                  reloadReady
                    ? location.reload()
                    : void updateServiceWorker(true)
                }
              >
                {reloadReady ? "Reload app" : "Update app"}
              </button>
            </Panel>
          )}
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
            >
              {error}
              <button
                aria-label="Dismiss error"
                className="flex h-11 w-11 shrink-0 items-center justify-center"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {["Overview", "Transactions", "Budgets", "Bills"].includes(page) && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              {monthPicker}
              <span className="text-xs text-[var(--muted)]">
                {current
                  ? "Current month"
                  : month > asOf.slice(0, 7)
                    ? "Future month · Posted entries only"
                    : "Historical view"}
              </span>
            </div>
          )}
          {page === "Overview" && (
            <div className="space-y-5">
              {!snapshot.accounts.length && (
                <Panel className="flex flex-wrap items-center justify-between gap-5 border-emerald-200! bg-emerald-50! p-6 dark:border-emerald-900! dark:bg-emerald-950!">
                  <div>
                    <h2 className="font-semibold">
                      A fresh start for your finances
                    </h2>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Add your first account, then record what comes in and goes
                      out.
                    </p>
                  </div>
                  <button
                    className={primary}
                    onClick={() => open({ kind: "account" })}
                  >
                    <Plus size={16} />
                    Add account
                  </button>
                </Panel>
              )}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                {[
                  {
                    label: "Total balance",
                    value: data.balance,
                    icon: Wallet,
                    note:
                      data.priorBalance > 0
                        ? `${(((data.balance - data.priorBalance) / data.priorBalance) * 100).toFixed(1)}% vs previous month end`
                        : "Across all accounts, including archived",
                  },
                  {
                    label: "Income",
                    value: data.income,
                    icon: ArrowDownLeft,
                    note: "Received this month · Excludes transfers",
                  },
                  {
                    label: "Expenses",
                    value: data.expenses,
                    icon: ArrowUpRight,
                    note: "Spent this month · Excludes transfers",
                  },
                  {
                    label: current ? "Safe to spend" : "Remaining budget",
                    value: current ? data.safeToSpend : data.remaining,
                    icon: ShieldCheck,
                    note: budgets.length
                      ? "Your planning estimate"
                      : "Set a budget to calculate",
                  },
                ].map(({ label, value, icon: Icon, note }, i) => (
                  <Panel
                    key={label}
                    className={`min-w-0 p-4 sm:p-5 ${i === 3 ? "border-emerald-200! dark:border-emerald-900!" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                      <span>{label}</span>
                      <Icon size={17} />
                    </div>
                    {value === null ? (
                      <p className="mt-4 text-base font-semibold leading-6">
                        Not calculated
                      </p>
                    ) : (
                      <Amount className="mt-4 block break-all text-[clamp(1.1rem,2vw,1.8rem)] font-semibold">
                        {cash(value)}
                      </Amount>
                    )}
                    <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
                      {i === 3 && data.remaining !== null ? (
                        <>
                          Budget left <Amount>{cash(data.remaining)}</Amount>
                        </>
                      ) : (
                        note
                      )}
                    </p>
                    {i === 3 && !budgets.length && (
                      <button
                        className="mt-2 min-h-11 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                        onClick={() => open({ kind: "budget" })}
                      >
                        Set a budget →
                      </button>
                    )}
                  </Panel>
                ))}
              </div>
              <div className="flex flex-wrap justify-between gap-3 px-1 text-xs">
                <span className="text-[var(--muted)]">
                  Net cash flow{" "}
                  <Amount
                    className={`ml-2 font-semibold ${data.net < 0 ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}
                  >
                    {cash(data.net)}
                  </Amount>
                  <span className="ml-2 text-[var(--muted)]">
                    Income minus expenses
                  </span>
                </span>
                <span className="text-[var(--muted)]">
                  Future-dated entries excluded
                </span>
              </div>
              <details className="rounded-lg border border-[var(--line)] px-4 py-3 text-xs leading-6 text-[var(--muted)]">
                <summary className="cursor-pointer font-medium text-[var(--text)]">
                  How is {current ? "safe to spend" : "remaining budget"}{" "}
                  calculated?
                </summary>
                <p className="mt-2">
                  Remaining budget = all category limits (
                  {cash(data.budgetLimit)}) − all expenses (
                  {cash(data.expenses)}), including unbudgeted categories.
                </p>
                <p>
                  Current cash {cash(data.balance)} − unpaid bills through month
                  end {cash(data.unpaidBills)} − savings reservations{" "}
                  {cash(data.reserved)}. Safe to spend is the lower of this
                  available cash and remaining budget, with a minimum of zero.
                  Paid bills are already expenses; they are not subtracted
                  twice.{" "}
                  {current
                    ? ""
                    : "Historical months show remaining budget only. "}
                  This is a planning estimate, not a guarantee of bank funds.
                </p>
              </details>
              <DashboardCharts data={data} currency={currency} />
              <div className="grid items-start gap-5 xl:grid-cols-[1.3fr_1fr]">
                <div>
                  <Heading title="Budget health">
                    <button
                      className="min-h-11 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                      onClick={() => navigate("Budgets")}
                    >
                      View all budgets →
                    </button>
                  </Heading>
                  {budgets.length ? (
                    budgetCards(4)
                  ) : (
                    <Panel>
                      <Empty
                        title="A little plan goes a long way"
                        action={
                          <button
                            className={button}
                            onClick={() => open({ kind: "budget" })}
                          >
                            Add budget
                          </button>
                        }
                      >
                        Set a monthly limit for a category to see your budget
                        health.
                      </Empty>
                    </Panel>
                  )}
                </div>
                <Panel className="p-5 sm:p-6">
                  <Heading title="Upcoming bills">
                    <button
                      className="min-h-11 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                      onClick={() => navigate("Bills")}
                    >
                      View all →
                    </button>
                  </Heading>
                  {billList(true)}
                </Panel>
              </div>
              <Panel className="p-5 sm:p-6">
                <Heading title="Recent transactions">
                  <button
                    className="min-h-11 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                    onClick={() => navigate("Transactions")}
                  >
                    View all →
                  </button>
                </Heading>
                {filters}
                {transactionRows(activity.slice(0, 5))}
              </Panel>
            </div>
          )}
          {page === "Transactions" && (
            <Panel className="p-5 sm:p-6">
              {filters}
              <p className="mb-2 text-xs text-[var(--muted)]">
                {activity.length} matching transactions · Transfers do not count
                as income or expenses.
              </p>
              {transactionRows(activity)}
            </Panel>
          )}
          {page === "Budgets" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-[var(--muted)]">
                  {budgets.length} categories · Total limit{" "}
                  <Amount>{cash(data.budgetLimit)}</Amount>
                </p>
                <button
                  className={primary}
                  onClick={() => open({ kind: "budget" })}
                >
                  <Plus size={16} />
                  Add budget
                </button>
              </div>
              {budgets.length ? (
                budgetCards()
              ) : (
                <Panel>
                  <Empty title="Build your monthly plan">
                    Add your first category budget. Old budgets stay attached to
                    their original month.
                  </Empty>
                </Panel>
              )}
              {unbudgeted.length > 0 && (
                <Panel className="border-amber-200! p-5 dark:border-amber-900!">
                  <h2 className="font-semibold">Unbudgeted spending</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    These expenses reduce your remaining monthly budget too.
                  </p>
                  <div className="mt-4 space-y-3">
                    {unbudgeted.map((c) => (
                      <div
                        key={c.category.id}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <CategoryBadge name={c.category.name} />
                        <Amount>{cash(c.amount)}</Amount>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          )}
          {page === "Savings" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-[var(--muted)]">
                    Reserved{" "}
                    <Amount className="font-semibold text-[var(--text)]">
                      {cash(data.reserved)}
                    </Amount>
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Reservations earmark money you own; they do not move money
                    or create expenses.
                  </p>
                </div>
                <button
                  className={primary}
                  onClick={() => open({ kind: "goal" })}
                >
                  <Plus size={16} />
                  New goal
                </button>
              </div>
              {data.reserved >
                safeTotal(
                  snapshot.accounts.map((a) =>
                    balanceFor(
                      a,
                      snapshot.transactions.filter((t) => t.date <= asOf),
                    ),
                  ),
                ) && (
                <p
                  role="alert"
                  className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  Savings reservations exceed current cash. Review your expenses
                  or release reserved funds.
                </p>
              )}
              <div className="grid gap-5 lg:grid-cols-2">
                {(snapshot.goals ?? []).map((g) => {
                  const history = (snapshot.contributions ?? [])
                    .filter((c) => c.goalId === g.id)
                    .sort((a, b) => b.date.localeCompare(a.date));
                  const saved = safeTotal(history.map((c) => c.amount));
                  return (
                    <Panel key={g.id} className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <PiggyBank size={22} />
                        </span>
                        <div className="flex">
                          <button
                            aria-label={`Edit ${g.name}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[var(--hover)]"
                            onClick={() => open({ kind: "goal", value: g })}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            aria-label={`Delete ${g.name}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[var(--hover)]"
                            onClick={() => {
                              if (
                                confirm(
                                  "Delete this goal and its released contribution history? Release all reserved funds first.",
                                )
                              )
                                void run(
                                  () => finance.deleteGoal(g.id),
                                  "Goal deleted",
                                );
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <h2 className="mt-4 break-words text-lg font-semibold">
                        {g.name}
                      </h2>
                      <div className="mb-4 mt-3 flex flex-wrap items-baseline justify-between gap-2">
                        <Amount className="text-2xl font-semibold">
                          {cash(saved)}
                        </Amount>
                        <span className="text-xs text-[var(--muted)]">
                          of <Amount>{cash(g.target)}</Amount>
                        </span>
                      </div>
                      <Progress
                        value={(saved / g.target) * 100}
                        threshold={100}
                        kind="saved"
                        label={`${g.name} saved`}
                      />
                      <p className="mt-3 font-mono tabular-nums text-xs text-[var(--muted)]">
                        {Math.round((saved / g.target) * 100)}% reserved ·{" "}
                        {cash(Math.max(0, g.target - saved))} to go
                      </p>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          className={primary}
                          onClick={() =>
                            open({ kind: "contribution", goal: g })
                          }
                        >
                          <Plus size={15} />
                          Add funds
                        </button>
                        <button
                          className={button}
                          disabled={!saved}
                          onClick={() =>
                            open({
                              kind: "contribution",
                              goal: g,
                              release: true,
                            })
                          }
                        >
                          Release funds
                        </button>
                      </div>
                      <details className="mt-5 border-t border-[var(--line)] pt-3">
                        <summary className="min-h-11 cursor-pointer text-xs font-semibold">
                          Contribution history ({history.length})
                        </summary>
                        {history.length ? (
                          history.map((c) => (
                            <div
                              key={c.id}
                              className="flex justify-between gap-4 py-2 text-xs"
                            >
                              <span className="font-mono tabular-nums text-[var(--muted)]">
                                {dateLabel(c.date)} ·{" "}
                                {c.amount > 0 ? "Reserved" : "Released"}
                              </span>
                              <Amount>{cash(Math.abs(c.amount))}</Amount>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-[var(--muted)]">
                            No funds reserved yet.
                          </p>
                        )}
                      </details>
                    </Panel>
                  );
                })}
              </div>
              {!snapshot.goals?.length && (
                <Panel>
                  <Empty title="Something worth saving for">
                    Create a goal, then reserve available funds whenever you are
                    ready.
                  </Empty>
                </Panel>
              )}
            </div>
          )}
          {page === "Reports" && (
            <div className="space-y-5">
              <Panel className="p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-2 text-xs font-medium">
                    From
                    <input
                      type="date"
                      className={input}
                      value={report.from}
                      onChange={(e) =>
                        setReport({ ...report, from: e.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-medium">
                    Through (inclusive)
                    <input
                      type="date"
                      className={input}
                      value={report.to}
                      onChange={(e) =>
                        setReport({ ...report, to: e.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-medium">
                    Type
                    <select
                      className={input}
                      value={report.kind}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          kind: e.target.value as ReportFilter["kind"],
                        })
                      }
                    >
                      <option value="all">All, including transfers</option>
                      <option value="income">Income</option>
                      <option value="expense">Expenses</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-medium">
                    Category
                    <select
                      className={input}
                      value={report.categoryId}
                      onChange={(e) =>
                        setReport({ ...report, categoryId: e.target.value })
                      }
                    >
                      <option value="">All categories</option>
                      {snapshot.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {report.from > report.to && (
                  <p
                    role="alert"
                    className="mt-3 text-sm text-rose-700 dark:text-rose-300"
                  >
                    End date must be on or after the start date.
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    disabled={!reports.length}
                    className={button}
                    onClick={() =>
                      downloadText(
                        buildCsv(snapshot, reports, currency),
                        `pennywise-report-${report.from}-${report.to}.csv`,
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    <Download size={16} />
                    Export CSV
                  </button>
                  <button
                    disabled={!reports.length}
                    className={button}
                    onClick={() => {
                      if (
                        !printReport(
                          snapshot,
                          reports,
                          currency,
                          `${report.from} – ${report.to}`,
                        )
                      )
                        setError(
                          "The print window was blocked. Allow popups for PennyWise and retry.",
                        );
                    }}
                  >
                    <Download size={16} />
                    Export PDF
                  </button>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  PDF opens your browser print dialog. Choose Save as PDF.
                  Exports match the filters above.
                </p>
              </Panel>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Income", value: reportIncome },
                  { label: "Expenses", value: reportExpenses },
                  {
                    label: "Net cash flow",
                    value: safeTotal([reportIncome, -reportExpenses]),
                  },
                ].map(({ label, value }) => (
                  <Panel key={label} className="p-5">
                    <p className="text-xs text-[var(--muted)]">{label}</p>
                    <Amount className="mt-3 block break-all text-xl font-semibold">
                      {cash(value)}
                    </Amount>
                  </Panel>
                ))}
              </div>
              <Panel className="p-5 sm:p-6">
                <Heading title="Category breakdown" />
                <p className="mb-4 text-xs text-[var(--muted)]">
                  Income and expenses exclude transfers. All records includes
                  transfers separately.
                </p>
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="text-[var(--muted)]">
                    <tr>
                      <th className="border-b border-[var(--line)] py-3 font-medium">
                        Category
                      </th>
                      <th className="border-b border-[var(--line)] py-3 text-right font-medium">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.categories
                      .filter((c) =>
                        reports.some(
                          (t) => t.kind !== "transfer" && t.categoryId === c.id,
                        ),
                      )
                      .map((c) => (
                        <tr key={c.id}>
                          <td className="border-b border-[var(--line)] py-3">
                            <CategoryBadge name={c.name} />
                          </td>
                          <td className="border-b border-[var(--line)] py-3 text-right">
                            <Amount>
                              {cash(
                                safeTotal(
                                  reports
                                    .filter(
                                      (t) =>
                                        t.kind !== "transfer" &&
                                        t.categoryId === c.id,
                                    )
                                    .map((t) => t.amount),
                                ),
                              )}
                            </Amount>
                          </td>
                        </tr>
                      ))}
                    {report.kind === "all" && !report.categoryId && (
                      <tr>
                        <td className="py-3">
                          Transfers (excluded from totals)
                        </td>
                        <td className="py-3 text-right">
                          <Amount>
                            {cash(
                              safeTotal(
                                reports
                                  .filter((t) => t.kind === "transfer")
                                  .map((t) => t.amount),
                              ),
                            )}
                          </Amount>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
              <Panel className="p-5 sm:p-6">
                <Heading title={`Matching transactions (${reports.length})`} />
                {transactionRows(reports)}
              </Panel>
            </div>
          )}
          {page === "Accounts" && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <button
                  className={primary}
                  onClick={() => open({ kind: "account" })}
                >
                  <Plus size={16} />
                  Add account
                </button>
              </div>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {snapshot.accounts.map((a) => (
                  <Panel key={a.id} className="p-6">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--hover)]">
                        <Wallet size={21} />
                      </span>
                      <span className="text-xs capitalize text-[var(--muted)]">
                        {a.type}
                        {a.archived ? " · Archived" : ""}
                      </span>
                    </div>
                    <h2 className="mt-5 break-words text-lg font-semibold">
                      {a.name}
                    </h2>
                    <Amount className="mt-3 block break-all text-2xl font-semibold">
                      {cash(
                        balanceFor(
                          a,
                          snapshot.transactions.filter((t) => t.date <= asOf),
                        ),
                      )}
                    </Amount>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Current balance · Future entries excluded
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        className={button}
                        onClick={() => open({ kind: "account", value: a })}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        className={button}
                        onClick={() =>
                          void run(
                            () =>
                              a.archived
                                ? finance.saveAccount({ ...a, archived: false })
                                : finance.archiveAccount(a.id),
                            a.archived
                              ? "Account restored"
                              : "Account archived",
                          )
                        }
                      >
                        {a.archived ? (
                          <RotateCcw size={14} />
                        ) : (
                          <Archive size={14} />
                        )}{" "}
                        {a.archived ? "Restore" : "Archive"}
                      </button>
                    </div>
                  </Panel>
                ))}
              </div>
              {!snapshot.accounts.length && (
                <Panel>
                  <Empty title="Where do you keep your money?">
                    Add cash, a bank account, or an e-wallet with its opening
                    balance.
                  </Empty>
                </Panel>
              )}
              <p className="text-xs leading-5 text-[var(--muted)]">
                Archived accounts stay in your total balance and transaction
                history. Use Log transaction → Transfer to move money between
                accounts.
              </p>
            </div>
          )}
          {page === "Bills" && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <button
                  className={primary}
                  onClick={() => open({ kind: "bill" })}
                >
                  <Plus size={16} />
                  Add bill
                </button>
              </div>
              <Panel className="p-5 sm:p-6">
                <Heading title="This month's bills" />
                {billList()}
              </Panel>
              {pending.some((o) => o.dueDate < `${month}-01`) && (
                <Panel className="p-5 sm:p-6">
                  <Heading title="Earlier unpaid bills" />
                  {pending
                    .filter((o) => o.dueDate < `${month}-01`)
                    .map((o) => (
                      <div
                        key={`${o.bill.id}-${o.dueDate}`}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{o.bill.name}</p>
                          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                            Overdue · {o.dueDate}
                          </p>
                        </div>
                        <Amount className="text-sm">
                          {cash(o.bill.amount)}
                        </Amount>
                        <button
                          className={button}
                          onClick={() => open({ kind: "payment", value: o })}
                        >
                          Record payment
                        </button>
                      </div>
                    ))}
                </Panel>
              )}
              <Panel className="p-5 sm:p-6">
                <Heading title="Bill schedules" />
                {snapshot.bills.length ? (
                  snapshot.bills.map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-medium">
                          {b.name}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {b.recurrence === "monthly" ? "Monthly" : "One time"}{" "}
                          · From {b.startDate}
                          {b.archived ? " · Ended" : ""}
                        </p>
                      </div>
                      <Amount className="text-sm">{cash(b.amount)}</Amount>
                      <button
                        className={button}
                        onClick={() => open({ kind: "bill", value: b })}
                      >
                        Edit
                      </button>
                      {!b.archived && (
                        <button
                          className={button}
                          onClick={() => {
                            if (
                              confirm(
                                "End this bill schedule? Existing payments are kept.",
                              )
                            )
                              void run(
                                () => finance.archiveBill(b.id),
                                "Bill schedule ended",
                              );
                          }}
                        >
                          End bill
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty title="No bill schedules yet">
                    Add a bill to track due dates and record its payments.
                  </Empty>
                )}
              </Panel>
            </div>
          )}
          {page === "Settings" && (
            <PreferencesScreen
              onImportOpen={setImportOpen}
              snapshot={snapshot}
              open={open}
              run={run}
              offline={offlineReady || hasOfflineWorker}
              online={online}
              install={
                install
                  ? () =>
                      void run(async () => {
                        await install.prompt();
                        await install.userChoice;
                        setInstall(null);
                      }, "Install request completed")
                  : undefined
              }
            />
          )}
          <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-[var(--line)] pt-5 text-[10px] text-[var(--muted)]">
            <span>PennyWise · A little wiser, every day.</span>
            <span>{currency} ledger · No bank connection · Device only</span>
          </footer>
        </main>
      </div>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-[var(--line)] bg-[var(--panel)] px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      >
        {[
          { p: "Overview" as Page, Icon: LayoutDashboard },
          { p: "Transactions" as Page, Icon: ArrowLeftRight },
          null,
          { p: "Budgets" as Page, Icon: BookOpen },
          { p: "More", Icon: MoreHorizontal },
        ].map((item, i) =>
          item ? (
            <button
              key={item.p}
              aria-label={item.p}
              aria-current={page === item.p ? "page" : undefined}
              onClick={() =>
                item.p === "More" ? setMore(true) : navigate(item.p as Page)
              }
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[9px] ${page === item.p ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "text-[var(--muted)]"}`}
            >
              <item.Icon size={20} />
              {item.p}
            </button>
          ) : (
            <button
              key={i}
              aria-label="Log transaction"
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm dark:bg-emerald-500 dark:text-zinc-950"
              onClick={() => open({ kind: "transaction" })}
            >
              <Plus size={24} />
            </button>
          ),
        )}
      </nav>
      {more && (
        <Sheet title="More" close={() => setMore(false)}>
          <div className="grid gap-2">
            {navigation.map(({ page: p, icon: Icon }) => (
              <button
                key={p}
                className={`${button} justify-start!`}
                onClick={() => navigate(p)}
              >
                <Icon size={18} />
                {p}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {editor && (
        <EditorSheet
          editor={editor}
          snapshot={snapshot}
          month={month}
          close={() => setEditor(null)}
          done={() => {
            setEditor(null);
            setMessage("Saved successfully");
          }}
        />
      )}
      {message && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-40 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--text)] px-5 py-3 text-sm text-[var(--panel)] shadow-lg md:bottom-6"
        >
          <Check size={17} />
          {message}
        </div>
      )}
    </div>
  );
}
