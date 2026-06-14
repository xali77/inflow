import { describe, it, expect } from "vitest";
import { generateSeedEvents } from "../lib/seed";
import { computeAnalytics } from "../lib/analytics";
import { computeFlowLines } from "../lib/flowline";
import { DEFAULT_SCORING } from "../lib/scoring";
import type { StoredEvent } from "../lib/events";

// The seed → analytics pipeline is what the admin dashboard renders. This is the
// end-to-end "does the demo data make sense" check.
const seed = generateSeedEvents(24).map((e, i) => ({ ...e, id: i })) as StoredEvent[];

describe("seed data feeds a coherent dashboard", () => {
  it("generates the event types the engine needs", () => {
    const types = new Set(seed.map((e) => e.type));
    expect(types.has("onboarding.completed")).toBe(true);
    expect(types.has("identity.verified")).toBe(true);
    expect(types.has("remittance.received")).toBe(true);
    expect(types.has("remittance.sent")).toBe(true);
  });

  it("computeAnalytics returns sane aggregates", () => {
    const a = computeAnalytics(seed, DEFAULT_SCORING);
    expect(a.stats.users).toBeGreaterThan(20);
    expect(a.stats.avgFlowScore).toBeGreaterThanOrEqual(300);
    expect(a.stats.avgFlowScore).toBeLessThanOrEqual(850);
    expect(a.stats.flowLines).toBeGreaterThan(0);
    expect(a.corridors.length).toBeGreaterThan(0);
    expect(a.scoreDistribution.reduce((s, b) => s + b.count, 0)).toBe(a.users.length);
  });

  it("every FlowScore and LineScore lands in range", () => {
    const a = computeAnalytics(seed, DEFAULT_SCORING);
    for (const u of a.users) {
      expect(u.flowScore).toBeGreaterThanOrEqual(300);
      expect(u.flowScore).toBeLessThanOrEqual(850);
    }
    for (const line of computeFlowLines(seed, DEFAULT_SCORING)) {
      expect(line.lineScore).toBeGreaterThanOrEqual(1);
      expect(line.lineScore).toBeLessThanOrEqual(100);
    }
  });

  it("produces at least some qualified, healthy FlowLines", () => {
    const lines = computeFlowLines(seed, DEFAULT_SCORING);
    expect(lines.some((l) => l.qualified)).toBe(true);
    expect(lines.some((l) => l.health === "healthy")).toBe(true);
  });
});
