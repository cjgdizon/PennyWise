import type { Snapshot, Transaction } from "./finance/types";
import { money, safeTotal } from "./finance/rules";

function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function reportRows(
  snapshot: Snapshot,
  entries: Transaction[],
  currency: "PHP" | "USD",
) {
  return entries.map((t) => [
    t.date,
    t.kind,
    t.note,
    t.kind === "transfer"
      ? "Transfer"
      : (snapshot.categories.find((c) => c.id === t.categoryId)?.name ?? ""),
    t.kind === "transfer"
      ? `${snapshot.accounts.find((a) => a.id === t.fromAccountId)?.name ?? ""} → ${snapshot.accounts.find((a) => a.id === t.toAccountId)?.name ?? ""}`
      : (snapshot.accounts.find((a) => a.id === t.accountId)?.name ?? ""),
    money(t.amount, currency),
  ]);
}
export function buildCsv(
  snapshot: Snapshot,
  entries: Transaction[],
  currency: "PHP" | "USD",
): string {
  return (
    "\uFEFF" +
    [
      ["Date", "Type", "Note", "Category", "Account", `Amount (${currency})`],
      ...reportRows(snapshot, entries, currency),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function downloadText(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printReport(
  snapshot: Snapshot,
  entries: Transaction[],
  currency: "PHP" | "USD",
  range: string,
): boolean {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  const doc = popup.document;
  const title = doc.createElement("h1");
  title.textContent = "PennyWise report";
  doc.body.append(title);
  const subtitle = doc.createElement("p");
  subtitle.textContent = `${range} · ${currency} · ${entries.length} transactions`;
  doc.body.append(subtitle);
  const summary = doc.createElement("p");
  summary.textContent = `Income: ${money(safeTotal(entries.filter((t) => t.kind === "income").map((t) => t.amount)), currency)} · Expenses: ${money(safeTotal(entries.filter((t) => t.kind === "expense").map((t) => t.amount)), currency)}. Transfers are excluded from these totals.`;
  doc.body.append(summary);
  const table = doc.createElement("table");
  for (const [index, row] of [
    ["Date", "Type", "Note", "Category", "Account", "Amount"],
    ...reportRows(snapshot, entries, currency),
  ].entries()) {
    const tr = doc.createElement("tr");
    for (const value of row) {
      const cell = doc.createElement(index === 0 ? "th" : "td");
      cell.textContent = value;
      tr.append(cell);
    }
    table.append(tr);
  }
  doc.body.append(table);
  const style = doc.createElement("style");
  style.textContent =
    "body{font:12px sans-serif;padding:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{padding:8px;text-align:left;border-bottom:1px solid #ccc;overflow-wrap:anywhere}td:last-child{text-align:right}tr{break-inside:avoid}@page{size:landscape;margin:12mm}";
  doc.head.append(style);
  popup.focus();
  popup.print();
  return true;
}
