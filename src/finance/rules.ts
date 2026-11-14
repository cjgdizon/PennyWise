import type { Account, Bill, Currency, Occurrence, Preferences, Transaction } from "./types";

export const defaultPreferences: Preferences = {
  id: "preferences", name: "", currency: "PHP", theme: "system", alerts: true,
};

export function parseMoney(text: string, allowNegative = false): number {
  const value = text.trim();
  if (value.length > 30) throw new Error("This amount is too large.");
  if (
    !(allowNegative ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(
      value,
    )
  ) {
    throw new Error(
      "Enter a valid amount with at most two decimal places.",
    );
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const centavos = Number(
    BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")),
  );
  if (!Number.isSafeInteger(centavos))
    throw new Error("This amount is too large.");
  return negative ? -centavos : centavos;
}

export function money(amount: number, currency: Currency = "PHP"): string {
  const centavos = BigInt(amount < 0 ? -amount : amount);
  const formatted = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
  })
    .formatToParts(centavos / 100n)
    .map((part) =>
      part.type === "fraction"
        ? String(centavos % 100n).padStart(2, "0")
        : part.value,
    )
    .join("");
  return amount < 0 ? `-${formatted}` : formatted;
}

export function today(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
}

export function validDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "9999-12-31"
  )
    return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function safeTotal(values: number[]): number {
  const result = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (
    result > BigInt(Number.MAX_SAFE_INTEGER) ||
    result < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("The combined amount is too large to store safely.");
  }
  return Number(result);
}

export function balanceFor(
  account: Account,
  transactions: Transaction[],
): number {
  return safeTotal([
    account.openingBalance,
    ...transactions.map((transaction) => {
      if (transaction.kind === "transfer") {
        return transaction.fromAccountId === account.id
          ? -transaction.amount
          : transaction.toAccountId === account.id
            ? transaction.amount
            : 0;
      }
      return transaction.accountId === account.id
        ? transaction.amount * (transaction.kind === "income" ? 1 : -1)
        : 0;
    }),
  ]);
}

export function dueInMonth(bill: Bill, month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(bill.startDate.slice(8)), lastDay)).padStart(2, "0")}`;
}

export function isScheduled(bill: Bill, date: string): boolean {
  if (date < bill.startDate || (bill.endDate && date > bill.endDate))
    return false;
  return bill.recurrence === "once"
    ? date === bill.startDate
    : date === dueInMonth(bill, date.slice(0, 7));
}

export function occurrences(
  bills: Bill[],
  transactions: Transaction[],
  from: string,
  to: string,
): Occurrence[] {
  if (!validDate(from) || !validDate(to) || from > to) return [];
  const payments = new Map(
    transactions.flatMap((transaction) =>
      transaction.kind === "expense" &&
      transaction.billId &&
      transaction.dueDate
        ? [
            [
              `${transaction.billId}:${transaction.dueDate}`,
              transaction.id,
            ] as const,
          ]
        : [],
    ),
  );
  const result: Occurrence[] = [];
  for (const bill of bills) {
    const add = (dueDate: string) => {
      if (dueDate < from || dueDate > to || !isScheduled(bill, dueDate)) return;
      const transactionId = payments.get(`${bill.id}:${dueDate}`);
      result.push({
        bill,
        dueDate,
        paid: Boolean(transactionId),
        transactionId,
      });
    };
    if (bill.recurrence === "once") {
      add(bill.startDate);
      continue;
    }
    const start = (from > bill.startDate ? from : bill.startDate).slice(0, 7);
    const end = (bill.endDate && bill.endDate < to ? bill.endDate : to).slice(
      0,
      7,
    );
    let [year, month] = start.split("-").map(Number);
    while (`${year}-${String(month).padStart(2, "0")}` <= end) {
      add(dueInMonth(bill, `${year}-${String(month).padStart(2, "0")}`));
      month++;
      if (month === 13) {
        year++;
        month = 1;
      }
    }
  }
  return result.sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.bill.name.localeCompare(b.bill.name),
  );
}
