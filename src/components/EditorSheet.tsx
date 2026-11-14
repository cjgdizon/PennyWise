import { useState, useRef, type FormEvent } from "react";
import { finance, parseMoney, today } from "../finance";
import type {
  Snapshot,
  Transaction,
  Account,
  Budget,
  Bill,
  Goal,
  Occurrence,
} from "../finance/types";
import { Field, Form, Sheet, button, input } from "./ui";
export type Editor =
  | { kind: "transaction"; value?: Transaction }
  | { kind: "account"; value?: Account }
  | { kind: "budget"; value?: Budget }
  | { kind: "bill"; value?: Bill }
  | { kind: "goal"; value?: Goal }
  | { kind: "contribution"; goal: Goal; release?: boolean }
  | { kind: "payment"; value: Occurrence }
  | { kind: "category" };
const decimal = (n: number) => {
  const v = BigInt(n);
  return `${v < 0n ? "-" : ""}${(v < 0n ? -v : v) / 100n}.${String((v < 0n ? -v : v) % 100n).padStart(2, "0")}`;
};
export function EditorSheet({
  editor,
  snapshot,
  month,
  close,
  done,
}: {
  editor: Editor;
  snapshot: Snapshot;
  month: string;
  close: () => void;
  done: () => void;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"income" | "expense" | "transfer">(
    editor.kind === "transaction"
      ? (editor.value?.kind ?? "expense")
      : "expense",
  );
  const currency = snapshot.preferences?.[0]?.currency ?? "PHP";
  const active = snapshot.accounts.filter((a) => !a.archived);
  const last = localStorage.getItem("pennywise-last-account");
  const defaultAccount = active.some((a) => a.id === last)
    ? last!
    : active[0]?.id;
  const [category, setCategory] = useState(
    editor.kind === "transaction" &&
      editor.value &&
      editor.value.kind !== "transfer"
      ? editor.value.categoryId
      : "",
  );
  const guardClose = () => {
    if (
      !busy &&
      (!dirty.current || window.confirm("Discard this unsaved entry?"))
    )
      close();
  };
  const titles = {
    transaction:
      editor.kind === "transaction" && editor.value
        ? "Edit transaction"
        : "Log transaction",
    account: "Account",
    budget: "Category budget",
    bill: "Bill",
    goal: "Savings goal",
    contribution:
      editor.kind === "contribution" && editor.release
        ? "Release funds"
        : "Add funds",
    payment: "Pay bill",
    category: "New category",
  };
  const amount = (
    value?: number,
    label = `Amount (${currency})`,
    name = "amount",
  ) => (
    <Field label={label}>
      <input
        data-autofocus
        name={name}
        className={`${input} font-mono text-xl! tabular-nums`}
        inputMode="decimal"
        placeholder="0.00"
        defaultValue={value === undefined ? "" : decimal(value)}
        required
      />
    </Field>
  );
  const selectAccount = (
    name = "accountId",
    label = "Account",
    initial?: string,
  ) => (
    <Field label={label}>
      <select
        aria-label={label}
        name={name}
        className={input}
        defaultValue={initial ?? defaultAccount}
        required
      >
        {!active.length && <option value="">Create an account first</option>}
        {snapshot.accounts
          .filter((a) => !a.archived || a.id === initial)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </select>
    </Field>
  );
  const selectCategory = (initial?: string) => (
    <Field label="Category">
      <select
        name="categoryId"
        className={input}
        defaultValue={initial}
        required
      >
        {snapshot.categories
          .filter(
            (c) => c.kind === "expense" && (!c.archived || c.id === initial),
          )
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
    </Field>
  );
  const date = (value = today(), name = "date", label = "Date") => (
    <Field label={label}>
      <input
        type="date"
        name={name}
        className={`${input} font-mono`}
        defaultValue={value}
        required
      />
    </Field>
  );
  const name = (label: string, value?: string) => (
    <Field label={label}>
      <input
        name="name"
        className={input}
        defaultValue={value}
        maxLength={120}
        required
      />
    </Field>
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "");
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
            kind: text("kind") as "income" | "expense",
            archived: false,
          });
          break;
        case "budget":
          await finance.saveBudget({
            id: editor.value?.id,
            month: text("month"),
            categoryId: text("categoryId"),
            amount: parseMoney(text("amount")),
            alertThreshold: Number(text("alertThreshold")),
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
        case "goal":
          await finance.saveGoal({
            id: editor.value?.id,
            name: text("name"),
            target: parseMoney(text("amount")),
          });
          break;
        case "contribution":
          await finance.contribute({
            goalId: editor.goal.id,
            amount: parseMoney(text("amount")) * (editor.release ? -1 : 1),
            date: text("date"),
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
            amount: parseMoney(text("amount")),
            date: text("date"),
            note: text("note"),
          };
          if (kind === "transfer")
            await finance.saveTransaction({
              ...base,
              kind,
              fromAccountId: text("fromAccountId"),
              toAccountId: text("toAccountId"),
            });
          else {
            const categoryId =
              category ||
              snapshot.categories.find(
                (c) => c.kind === kind && (!c.archived || c.id === category),
              )?.id;
            if (!categoryId) throw new Error("Create a category first.");
            await finance.saveTransaction({
              ...base,
              kind,
              accountId: text("accountId"),
              categoryId,
              ...(editor.value?.kind === "expense" && editor.value.billId
                ? { billId: editor.value.billId, dueDate: editor.value.dueDate }
                : {}),
            });
            localStorage.setItem("pennywise-last-account", text("accountId"));
          }
          break;
        }
      }
      dirty.current = false;
      done();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={titles[editor.kind]} close={guardClose}>
      <div
        ref={formRef}
        onChange={() => {
          dirty.current = true;
        }}
      >
        <Form onSubmit={submit} error={error} busy={busy}>
          {editor.kind === "transaction" && (
            <>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--hover)] p-1">
                {(["expense", "income", "transfer"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={!!editor.value && editor.value.kind !== type}
                    aria-pressed={kind === type}
                    className={`${button} border-0! px-2! capitalize ${kind !== type ? "bg-transparent! text-[var(--muted)]!" : ""}`}
                    onClick={() => {
                      setKind(type);
                      setCategory("");
                      dirty.current = true;
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
              {amount(editor.value?.amount)}
              {kind !== "transfer" && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Category</legend>
                  <div className="flex flex-wrap gap-2">
                    {snapshot.categories
                      .filter(
                        (c) =>
                          c.kind === kind && (!c.archived || c.id === category),
                      )
                      .map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          aria-pressed={
                            (category ||
                              snapshot.categories.find(
                                (c) => c.kind === kind && !c.archived,
                              )?.id) === c.id
                          }
                          className={`${button} min-h-11! px-3! text-xs! ${(category || snapshot.categories.find((c) => c.kind === kind && !c.archived)?.id) === c.id ? "border-emerald-600! bg-emerald-50! text-emerald-800! dark:bg-emerald-950! dark:text-emerald-200!" : ""}`}
                          onClick={() => {
                            setCategory(c.id);
                            dirty.current = true;
                          }}
                        >
                          {c.name}
                          {c.archived ? " (archived — choose another)" : ""}
                        </button>
                      ))}
                  </div>
                </fieldset>
              )}
              {kind === "transfer" ? (
                <>
                  {selectAccount(
                    "fromAccountId",
                    "From account",
                    editor.value?.kind === "transfer"
                      ? editor.value.fromAccountId
                      : undefined,
                  )}
                  {selectAccount(
                    "toAccountId",
                    "To account",
                    editor.value?.kind === "transfer"
                      ? editor.value.toAccountId
                      : active[1]?.id,
                  )}
                </>
              ) : (
                selectAccount(
                  "accountId",
                  "Account",
                  editor.value && editor.value.kind !== "transfer"
                    ? editor.value.accountId
                    : undefined,
                )
              )}
              {date(editor.value?.date)}
              <Field label="Note (optional)">
                <input
                  name="note"
                  className={input}
                  placeholder="What was it for?"
                  maxLength={5000}
                  defaultValue={editor.value?.note}
                />
              </Field>
              {editor.value?.kind === "expense" && editor.value.billId && (
                <p className="text-sm text-[var(--muted)]">
                  Linked to a bill payment. The due date stays unchanged.
                </p>
              )}
            </>
          )}
          {editor.kind === "account" && (
            <>
              {name("Account name", editor.value?.name)}
              <Field label="Account type">
                <select
                  name="type"
                  className={input}
                  defaultValue={editor.value?.type ?? "cash"}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="ewallet">E-wallet</option>
                </select>
              </Field>
              {amount(
                editor.value?.openingBalance ?? 0,
                `Opening balance (${currency})`,
                "openingBalance",
              )}
              <p className="text-sm text-[var(--muted)]">
                Your balance before recorded transactions. This is not income.
              </p>
            </>
          )}
          {editor.kind === "category" && (
            <>
              {name("Category name")}
              <Field label="Used for">
                <select name="kind" className={input}>
                  <option value="expense">Expenses</option>
                  <option value="income">Income</option>
                </select>
              </Field>
            </>
          )}
          {editor.kind === "budget" && (
            <>
              <Field label="Month">
                <input
                  type="month"
                  name="month"
                  className={input}
                  defaultValue={editor.value?.month ?? month}
                  required
                />
              </Field>
              {selectCategory(editor.value?.categoryId)}
              {amount(editor.value?.amount, `Monthly limit (${currency})`)}
              <Field label="Alert threshold (%)">
                <input
                  name="alertThreshold"
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  className={`${input} font-mono`}
                  defaultValue={editor.value?.alertThreshold ?? 80}
                  required
                />
              </Field>
            </>
          )}
          {editor.kind === "bill" && (
            <>
              {name("Bill name", editor.value?.name)}
              {amount(editor.value?.amount)}
              {selectCategory(editor.value?.categoryId)}
              {date(editor.value?.startDate, "startDate", "First due date")}
              <Field label="Repeats">
                <select
                  name="recurrence"
                  className={input}
                  defaultValue={editor.value?.recurrence ?? "monthly"}
                >
                  <option value="monthly">Every month</option>
                  <option value="once">One time</option>
                </select>
              </Field>
            </>
          )}
          {editor.kind === "payment" && (
            <>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Record payment for {editor.value.bill.name}. This creates an
                expense; it does not send money to the provider.
              </p>
              {amount(editor.value.bill.amount)}
              {selectAccount()}
              {date()}
            </>
          )}
          {editor.kind === "goal" && (
            <>
              {name("Goal name", editor.value?.name)}
              {amount(editor.value?.target, `Target amount (${currency})`)}
              <p className="text-sm text-[var(--muted)]">
                Reserve existing money toward this goal. Your account balance
                does not change.
              </p>
            </>
          )}
          {editor.kind === "contribution" && (
            <>
              <p className="text-sm text-[var(--muted)]">
                {editor.release
                  ? "Return reserved money to your available balance."
                  : "Reserve money you already have."}{" "}
                No income, expense or bank transfer is created.
              </p>
              {amount()}
              {date()}
            </>
          )}
        </Form>
      </div>
    </Sheet>
  );
}
