import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { database } from "./storage";
import { finance, defaultPreferences } from "./index";

const legacySchema = {
  accounts: "id", categories: "id", transactions: "id, date, &occurrenceKey",
  budgets: "id, &[month+categoryId]", bills: "id", meta: "key",
};
const account = { id: "legacy-cash", name: "Legacy cash", type: "cash", openingBalance: 10_000, archived: false };
const category = { id: "legacy-food", name: "Food", kind: "expense", archived: false };
const budget = { id: "legacy-budget", month: "2026-11", categoryId: category.id, amount: 5_000 };

async function seedLegacy() {
  await database.delete();
  const legacy = new Dexie(database.name);
  legacy.version(1).stores(legacySchema);
  await legacy.open();
  await legacy.table("accounts").put(account);
  await legacy.table("categories").put(category);
  await legacy.table("budgets").put(budget);
  await legacy.table("meta").put({ key: "revision", value: 7 });
  legacy.close();
}

afterEach(() => database.close());

describe("Dexie version-two migration", () => {
  it("keeps every legacy record and identifier while adding defaults", async () => {
    await seedLegacy();
    await database.open();
    const snapshot = await finance.getSnapshot();
    expect(database.verno).toBe(2);
    expect(snapshot.accounts).toEqual([account]);
    expect(snapshot.categories).toEqual([category]);
    expect(snapshot.budgets).toEqual([{ ...budget, alertThreshold: 80 }]);
    expect(snapshot.goals).toEqual([]);
    expect(snapshot.contributions).toEqual([]);
    expect(snapshot.preferences).toEqual([defaultPreferences]);
    expect(snapshot.revision).toBe(8);
  });

  it("rolls back the actual migration when its preferences write fails", async () => {
    await seedLegacy();
    const fail = () => { throw new Error("Simulated migration failure"); };
    database.table("preferences").hook("creating", fail);
    try {
      await expect(database.open()).rejects.toThrow("Simulated migration failure");
    } finally {
      database.table("preferences").hook("creating").unsubscribe(fail);
      database.close();
    }
    const legacy = new Dexie(database.name);
    legacy.version(1).stores(legacySchema);
    await legacy.open();
    expect(await legacy.table("accounts").toArray()).toEqual([account]);
    expect(await legacy.table("budgets").toArray()).toEqual([budget]);
    expect(await legacy.table("meta").get("revision")).toEqual({ key: "revision", value: 7 });
    legacy.close();
    await database.open();
    expect((await finance.getSnapshot()).preferences).toEqual([defaultPreferences]);
  });

  it("closes on an external upgrade and refuses to open an unsupported future schema", async () => {
    await seedLegacy();
    await database.open();
    const future = new Dexie(database.name);
    future.version(2).stores({ ...legacySchema, goals: "id", contributions: "id, goalId, date", preferences: "id" });
    future.version(3).stores({ futureRecords: "id" });
    await future.open();
    expect(database.isOpen()).toBe(false);
    await expect(finance.saveGoal({ name: "Should not write", target: 100 })).rejects.toThrow("newer PennyWise app");
    future.close();
    await expect(database.open()).rejects.toThrow("newer PennyWise app");
  });
});
