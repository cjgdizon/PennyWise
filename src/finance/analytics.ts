import type { Snapshot, Transaction } from "./types";
import { balanceFor, occurrences, safeTotal, today, validDate } from "./rules";

export type ReportFilter = {
  from: string;
  to: string;
  kind: "all" | "income" | "expense";
  categoryId: string;
};
export function filterTransactions(
  snapshot: Snapshot,
  filter: ReportFilter,
): Transaction[] {
  if (
    !validDate(filter.from) ||
    !validDate(filter.to) ||
    filter.from > filter.to
  )
    return [];
  return snapshot.transactions
    .filter(
      (row) =>
        row.date >= filter.from &&
        row.date <= filter.to &&
        (filter.kind === "all" || row.kind === filter.kind) &&
        (!filter.categoryId ||
          (row.kind !== "transfer" && row.categoryId === filter.categoryId)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function monthEnd(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}`;
}
export function deriveDashboard(
  snapshot: Snapshot,
  month: string,
  asOf = today(),
) {
  const end = monthEnd(month);
  const cutoff = end < asOf ? end : asOf;
  const posted = snapshot.transactions.filter((t) => t.date <= cutoff);
  const entries = posted.filter((t) => t.date.startsWith(month));
  const sum = (kind: "income" | "expense") =>
    safeTotal(entries.filter((t) => t.kind === kind).map((t) => t.amount));
  const income = sum("income"),
    expenses = sum("expense");
  const balance = safeTotal(
    snapshot.accounts.map((a) => balanceFor(a, posted)),
  );
  const before = `${month}-01`;
  const priorBalance = safeTotal(
    snapshot.accounts.map((a) =>
      balanceFor(
        a,
        snapshot.transactions.filter((t) => t.date < before),
      ),
    ),
  );
  const budgets = snapshot.budgets.filter((b) => b.month === month);
  const budgetLimit = safeTotal(budgets.map((b) => b.amount));
  const remaining = budgets.length ? safeTotal([budgetLimit, -expenses]) : null;
  const reserved = safeTotal(
    (snapshot.contributions ?? [])
      .filter((c) => c.date <= asOf)
      .map((c) => c.amount),
  );
  const firstBill = snapshot.bills.reduce(
    (date, b) => (b.startDate < date ? b.startDate : date),
    `${month}-01`,
  );
  const unpaid = occurrences(
    snapshot.bills,
    snapshot.transactions.filter((t) => t.date <= asOf),
    firstBill,
    end,
  ).filter((o) => !o.paid);
  const unpaidBills = safeTotal(unpaid.map((o) => o.bill.amount));
  const current = month === asOf.slice(0, 7);
  const safeToSpend =
    current && remaining !== null
      ? Math.max(
          0,
          Math.min(remaining, safeTotal([balance, -unpaidBills, -reserved])),
        )
      : null;
  const categories = snapshot.categories
    .filter((c) => c.kind === "expense")
    .map((category) => ({
      category,
      amount: safeTotal(
        entries
          .filter((t) => t.kind === "expense" && t.categoryId === category.id)
          .map((t) => t.amount),
      ),
    }));
  const days = Number(end.slice(8));
  const weekly = Array.from({ length: Math.ceil(days / 7) }, (_, i) => ({
    label: `${i * 7 + 1}–${Math.min(days, i * 7 + 7)}`,
    actual: safeTotal(
      entries
        .filter(
          (t) =>
            t.kind === "expense" &&
            Math.floor((Number(t.date.slice(8)) - 1) / 7) === i,
        )
        .map((t) => t.amount),
    ),
    target: budgets.length
      ? Number(
          (BigInt(budgetLimit) * BigInt(Math.min(days, i * 7 + 7))) /
            BigInt(days) -
            (BigInt(budgetLimit) * BigInt(i * 7)) / BigInt(days),
        )
      : 0,
  }));
  return {
    balance,
    priorBalance,
    income,
    expenses,
    net: safeTotal([income, -expenses]),
    budgetLimit,
    remaining,
    reserved,
    unpaidBills,
    safeToSpend,
    categories,
    weekly,
  };
}
