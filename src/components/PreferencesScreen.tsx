import { useEffect, useRef, useState } from "react";
import { Download, Upload, Plus, Archive, RotateCcw } from "lucide-react";
import { finance, defaultPreferences, today } from "../finance";
import { hasMonetaryRecords } from "../finance/validation";
import type {
  Snapshot,
  ImportPreview,
  ConflictChoices,
  Preferences,
} from "../finance/types";
import { downloadText } from "../reports";
import { Panel, Field, Sheet, button, primary, input } from "./ui";
import type { Editor } from "./EditorSheet";
export function PreferencesScreen({
  snapshot,
  open,
  run,
  offline,
  online,
  install,
  onImportOpen,
}: {
  onImportOpen: (open: boolean) => void;
  snapshot: Snapshot;
  open: (e: Editor) => void;
  run: (f: () => Promise<unknown>, message: string) => Promise<void>;
  offline: boolean;
  online: boolean;
  install?: () => void;
}) {
  useEffect(() => {
    return () => onImportOpen(false);
  }, [onImportOpen]);
  const preferences = snapshot.preferences?.[0] ?? defaultPreferences;
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<ConflictChoices>({});
  useEffect(() => {
    onImportOpen(!!preview);
  }, [preview, onImportOpen]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [lastExport, setLastExport] = useState(
    () => localStorage.getItem("pennywise-last-export") ?? "",
  );
  async function exportBackup() {
    await run(async () => {
      downloadText(
        await finance.exportBackup(),
        `pennywise-backup-${today()}.json`,
        "application/json",
      );
      const stamp = new Date().toLocaleString();
      setLastExport(stamp);
      localStorage.setItem("pennywise-last-export", stamp);
    }, "Backup exported");
  }
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel className="p-6">
        <h2 className="text-lg font-semibold">Local profile</h2>
        <p className="mb-6 mt-2 text-sm text-[var(--muted)]">
          Your preferences stay on this device. No sign-in needed.
        </p>
        <form
          key={JSON.stringify(preferences)}
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () =>
                finance.savePreferences({
                  id: "preferences",
                  name: String(f.get("name")),
                  currency: hasMonetaryRecords(snapshot)
                    ? preferences.currency
                    : (f.get("currency") as Preferences["currency"]),
                  theme: f.get("theme") as Preferences["theme"],
                  alerts: f.get("alerts") === "on",
                }),
              "Preferences saved",
            );
          }}
        >
          <Field label="Your name">
            <input
              name="name"
              defaultValue={preferences.name}
              maxLength={120}
              className={input}
            />
          </Field>
          <Field label="Ledger currency">
            <select
              name="currency"
              className={input}
              defaultValue={preferences.currency}
              disabled={hasMonetaryRecords(snapshot)}
            >
              <option value="PHP">PHP · Philippine peso</option>
              <option value="USD">USD · US dollar</option>
            </select>
          </Field>
          <p className="text-xs leading-5 text-[var(--muted)]">
            One denomination for this ledger. No exchange or conversion.
            {hasMonetaryRecords(snapshot) &&
              " Currency is locked while monetary records exist to protect existing amounts."}
          </p>
          <Field label="Appearance">
            <select
              name="theme"
              defaultValue={preferences.theme}
              className={input}
            >
              <option value="system">Follow system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              name="alerts"
              type="checkbox"
              defaultChecked={preferences.alerts}
              className="h-5 w-5 accent-emerald-600"
            />
            Show in-app near-limit budget alerts
          </label>
          <p className="text-xs text-[var(--muted)]">
            Over-limit amounts always stay visible. These are in-app reminders.
          </p>
          <button className={primary}>Save preferences</button>
        </form>
      </Panel>
      <div className="space-y-5">
        <Panel className="p-6">
          <h2 className="text-lg font-semibold">Backup & restore</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Keep a copy before app upgrades or switching devices. Import
            combines records and lets you resolve conflicts explicitly.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className={button} onClick={() => void exportBackup()}>
              <Download size={16} />
              Export backup
            </button>
            <button className={button} onClick={() => file.current?.click()}>
              <Upload size={16} />
              Import backup
            </button>
            <input
              ref={file}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Import backup file"
              onChange={async (e) => {
                const selected = e.target.files?.[0];
                e.target.value = "";
                if (!selected) return;
                setError("");
                try {
                  if (selected.size > 10_000_000)
                    throw new Error("Choose a backup smaller than 10 MB.");
                  setPreview(
                    await finance.previewImport(await selected.text()),
                  );
                  setChoices({});
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not read backup.",
                  );
                }
              }}
            />
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Last exported: {lastExport || "No backup exported yet"}
          </p>
          {error && (
            <p
              role="alert"
              className="mt-4 text-sm text-rose-700 dark:text-rose-300"
            >
              {error}
            </p>
          )}
        </Panel>
        <Panel className="p-6">
          <h2 className="font-semibold">On this device</h2>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {online ? "Online" : "You are offline"} ·{" "}
            {offline ? "Ready for offline use" : "Offline support is preparing"}
          </p>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Records live in this browser. Clearing site data removes them.
            Export a backup regularly. PennyWise has no bank connection.
          </p>
          {install && (
            <button className={`${button} mt-4`} onClick={install}>
              Install PennyWise
            </button>
          )}
        </Panel>
      </div>
      <Panel className="p-6 lg:col-span-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Categories</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Archive unused categories while keeping their history.
            </p>
          </div>
          <button className={button} onClick={() => open({ kind: "category" })}>
            <Plus size={16} />
            Add category
          </button>
        </div>
        <div className="mt-5 grid gap-x-8 sm:grid-cols-2">
          {snapshot.categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 border-t border-[var(--line)] py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="mt-1 text-xs capitalize text-[var(--muted)]">
                  {c.kind}
                  {c.archived ? " · Archived" : ""}
                </p>
              </div>
              <button
                className={`${button} px-3!`}
                aria-label={`${c.archived ? "Restore" : "Archive"} ${c.name}`}
                onClick={() =>
                  void run(
                    () =>
                      c.archived
                        ? finance.saveCategory({ ...c, archived: false })
                        : finance.archiveCategory(c.id),
                    c.archived ? "Category restored" : "Category archived",
                  )
                }
              >
                {c.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
              </button>
            </div>
          ))}
        </div>
      </Panel>
      {preview && (
        <Sheet
          title="Review backup import"
          close={() => !busy && setPreview(null)}
        >
          <p className="text-sm leading-6">
            {preview.added} additions · {preview.skipped} unchanged ·{" "}
            {preview.conflicts.length} conflicts. No records are deleted simply
            because they are missing from the backup.
          </p>
          <details className="my-5">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              Preview incoming records
            </summary>
            <div className="mt-2 max-h-48 overflow-auto text-xs">
              {(
                [
                  "accounts",
                  "categories",
                  "transactions",
                  "budgets",
                  "bills",
                  "goals",
                  "contributions",
                  "preferences",
                ] as const
              ).map((key) => (
                <p key={key} className="py-1">
                  {key}: {(preview.incoming[key] ?? []).length}
                </p>
              ))}
            </div>
          </details>
          {preview.conflicts.map((c) => (
            <fieldset
              key={c.key}
              className="mb-5 rounded-lg border border-[var(--line)] p-4"
            >
              <legend className="px-2 text-sm font-semibold capitalize">
                {c.collection} conflict
              </legend>
              {(["current", "incoming"] as const).map((version) => (
                <label
                  key={version}
                  className="my-2 block rounded-lg bg-[var(--hover)] p-3"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={c.key}
                      checked={choices[c.key] === version}
                      onChange={() =>
                        setChoices({ ...choices, [c.key]: version })
                      }
                    />
                    {version === "current" ? "Keep current" : "Use imported"}
                  </span>
                  <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all text-[10px]">
                    {JSON.stringify(c[version], null, 2)}
                  </pre>
                </label>
              ))}
            </fieldset>
          ))}
          {error && (
            <p
              role="alert"
              className="mb-4 text-sm text-rose-700 dark:text-rose-300"
            >
              {error}
            </p>
          )}
          <button
            disabled={busy || preview.conflicts.some((c) => !choices[c.key])}
            className={`${primary} w-full`}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await finance.commitImport(preview, choices);
                setPreview(null);
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : "Import failed",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Combining…" : "Combine records"}
          </button>
        </Sheet>
      )}
    </div>
  );
}
