import { useState } from "react";
import { Panel, Amount } from "./ui";
import type { deriveDashboard } from "../finance/analytics";
import { money, safeTotal } from "../finance";
import type { Currency } from "../finance/types";
const colors = [
  "#10b981",
  "#38bdf8",
  "#a78bfa",
  "#fbbf24",
  "#fb7185",
  "#94a3b8",
];
export function DashboardCharts({
  data,
  currency,
}: {
  data: ReturnType<typeof deriveDashboard>;
  currency: Currency;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [week, setWeek] = useState<number | null>(null);
  const categories = data.categories.filter((c) => c.amount > 0);
  const visible = categories.filter((c) => !hidden.includes(c.category.id));
  const total = safeTotal(visible.map((c) => c.amount));
  const allTotal = safeTotal(categories.map((c) => c.amount));
  const max = Math.max(1, ...data.weekly.flatMap((w) => [w.actual, w.target]));
  let offset = 0;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Spending overview</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Weekly expenses versus your budget target
            </p>
          </div>
          <div className="flex gap-4 text-xs">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Actual
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-zinc-600" />
              Target
            </span>
          </div>
        </div>
        <div className="mt-8 grid h-44 grid-cols-5 items-end gap-3 border-b border-[var(--line)]">
          {data.weekly.map((w, i) => (
            <div
              key={w.label}
              tabIndex={0}
              onFocus={() => setWeek(i)}
              onMouseEnter={() => setWeek(i)}
              aria-label={`Days ${w.label}: expenses ${money(w.actual, currency)}, target ${money(w.target, currency)}`}
              title={`Expenses ${money(w.actual, currency)} / target ${money(w.target, currency)}`}
              className="group flex h-full items-end justify-center gap-1 rounded-t-sm"
            >
              <div
                style={{
                  height: `${Math.max(w.actual ? 2 : 0, (w.actual / max) * 100)}%`,
                }}
                className="w-5 rounded-t bg-emerald-500 sm:w-8"
              />
              <div
                style={{ height: `${(w.target / max) * 100}%` }}
                className="w-5 rounded-t bg-slate-200 dark:bg-zinc-600 sm:w-8"
              />
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-5 gap-3 text-center font-mono text-[10px] text-[var(--muted)]">
          {data.weekly.map((w) => (
            <span key={w.label}>{w.label}</span>
          ))}
        </div>
        <p
          aria-live="polite"
          className="mt-4 min-h-5 font-mono text-xs text-[var(--muted)]"
        >
          {week !== null && data.weekly[week]
            ? `Days ${data.weekly[week].label}: ${money(data.weekly[week].actual, currency)} actual / ${money(data.weekly[week].target, currency)} target`
            : "Focus or hover a week for exact values."}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Days of the month · Focus a week for its exact values.
          {!data.budgetLimit && " Set a budget to display targets."}
        </p>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <h2 className="font-semibold">Where it went</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Expenses by category · Toggle to explore
        </p>
        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:flex-wrap">
          <div className="relative mx-auto h-40 w-40 shrink-0">
            <svg
              viewBox="0 0 120 120"
              role="img"
              aria-label={`Selected category spending ${money(total, currency)}`}
              className="h-full w-full -rotate-90"
            >
              <circle
                cx="60"
                cy="60"
                r="46"
                fill="none"
                stroke="var(--hover)"
                strokeWidth="14"
              />
              {visible.map((c) => {
                const share = (c.amount / total) * 289;
                const start = offset;
                offset += share;
                return (
                  <circle
                    key={c.category.id}
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke={colors[categories.indexOf(c) % colors.length]}
                    strokeWidth="14"
                    strokeDasharray={`${share} ${289 - share}`}
                    strokeDashoffset={-start}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] text-[var(--muted)]">
                Selected total
              </span>
              <Amount className="mt-1 text-xs font-semibold">
                {money(total, currency)}
              </Amount>
            </div>
          </div>
          <div className="min-w-0 w-full flex-1 space-y-1 sm:w-auto">
            {categories.length ? (
              categories.map((c, i) => (
                <button
                  key={c.category.id}
                  aria-pressed={!hidden.includes(c.category.id)}
                  onClick={() =>
                    setHidden(
                      hidden.includes(c.category.id)
                        ? hidden.filter((id) => id !== c.category.id)
                        : [...hidden, c.category.id],
                    )
                  }
                  className="flex min-h-11 w-full items-center gap-2 rounded-md px-1 text-left text-xs hover:bg-[var(--hover)]"
                >
                  <span
                    style={{ background: colors[i % colors.length] }}
                    className={`h-2 w-2 shrink-0 rounded-full ${hidden.includes(c.category.id) ? "opacity-25 ring-1 ring-[var(--text)]" : ""}`}
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {c.category.name}
                    <span className="mt-1 block font-mono text-[10px] text-[var(--muted)]">
                      {((c.amount / allTotal) * 100).toFixed(1)}%
                    </span>
                  </span>
                  <Amount>{money(c.amount, currency)}</Amount>
                </button>
              ))
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Your category breakdown appears after your first expense.
              </p>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
