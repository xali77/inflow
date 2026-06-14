import { describe, it, expect, afterAll } from "vitest";
import {
  intervalDaysFor,
  computeNextRun,
  createSchedule,
  listSchedules,
  runDueSchedules,
  deleteSchedule,
} from "../lib/schedules";

const OWNER = "0x" + "c".repeat(40);
const TO = "0x" + "d".repeat(40);
const cleanup: string[] = [];

afterAll(async () => {
  for (const id of cleanup) await deleteSchedule(id);
});

describe("schedule cadence math", () => {
  it("maps cadences to intervals", () => {
    expect(intervalDaysFor("weekly")).toBe(7);
    expect(intervalDaysFor("monthly")).toBe(30);
    expect(intervalDaysFor("custom", 5)).toBe(5);
    expect(intervalDaysFor("once")).toBe(0);
  });

  it("computeNextRun adds the interval", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(computeNextRun(from, "weekly")).toBe("2026-01-08T00:00:00.000Z");
    expect(computeNextRun(from, "once")).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("runDueSchedules", () => {
  it("auto-sends a due schedule, records it, and rolls it forward", async () => {
    const s = await createSchedule({
      owner: OWNER,
      walletId: "wallet-1",
      to: TO,
      amount: 5,
      cadence: "weekly",
      next_run: new Date(Date.now() - 1000).toISOString(), // due
    });
    cleanup.push(s.id);

    const sent: Array<[string, string, number]> = [];
    const recorded: Array<[string, string, string]> = [];
    const res = await runDueSchedules(OWNER, {
      send: async (walletId, to, amount) => {
        sent.push([walletId, to, amount]);
        return "0xhash";
      },
      record: async (from, to, amount) => {
        recorded.push([from, to, amount]);
      },
    });

    expect(res.processed).toBe(1);
    expect(res.errors).toBe(0);
    expect(sent[0]).toEqual(["wallet-1", TO.toLowerCase(), 5]);
    expect(recorded[0]).toEqual([OWNER.toLowerCase(), TO.toLowerCase(), "5.00"]);

    const after = (await listSchedules(OWNER)).find((x) => x.id === s.id)!;
    expect(after.runs).toBe(1);
    expect(new Date(after.next_run).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not double-send when run again before the next due date", async () => {
    const s = await createSchedule({
      owner: OWNER,
      walletId: "wallet-2",
      to: TO,
      amount: 9,
      cadence: "weekly",
      next_run: new Date(Date.now() - 1000).toISOString(),
    });
    cleanup.push(s.id);

    const deps = { send: async () => "0xhash", record: async () => {} };
    const first = await runDueSchedules(OWNER, deps);
    const second = await runDueSchedules(OWNER, deps);
    // first run processes both due schedules left over; second finds none due
    expect(first.processed).toBeGreaterThanOrEqual(1);
    expect(second.processed).toBe(0);
  });
});
