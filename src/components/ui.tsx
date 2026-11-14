import { useEffect, useRef, type ReactNode, type FormEvent } from "react";
import { X, Inbox } from "lucide-react";

export const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-50";
export const primary = `${button} border-transparent! bg-emerald-700! text-white! hover:bg-emerald-800! dark:bg-emerald-500! dark:text-zinc-950! dark:hover:bg-emerald-400!`;
export const input =
  "min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]";
export const muted = "text-[var(--muted)]";
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      {children}
    </section>
  );
}
export function Amount({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums tracking-tight ${className}`}>
      {children}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Inbox className="mb-4 text-[var(--muted)]" size={28} />
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-5 mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
        {children}
      </p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
export function Progress({
  value,
  threshold = 80,
  label,
  kind = "spent",
}: {
  value: number;
  threshold?: number;
  label: string;
  kind?: "spent" | "saved";
}) {
  const color =
    kind === "saved"
      ? "bg-emerald-500"
      : value >= 100
        ? "bg-rose-500"
        : value >= threshold
          ? "bg-amber-500"
          : "bg-emerald-500";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(Math.max(0, Math.min(100, value)))}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${Math.round(value)} percent ${kind === "saved" ? "reserved" : "spent"}`}
      className="h-2 overflow-hidden rounded-full bg-[var(--hover)]"
    >
      <div
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        className={`h-full rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none ${color}`}
      />
    </div>
  );
}
export function Sheet({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    const first =
      dialog.current?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-lg overflow-y-auto border-0 bg-[var(--panel)] p-0 text-[var(--text)] backdrop:bg-black/40"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-6 py-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          type="button"
          aria-label="Close"
          className={`${button} px-3!`}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </dialog>
  );
}
export function Form({
  onSubmit,
  children,
  error,
  busy,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  error: string;
  busy: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {children}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200"
        >
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className={`${primary} mt-2 w-full`}
        type="submit"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
