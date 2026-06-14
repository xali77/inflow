import { describe, it, expect } from "vitest";
import { computeFlowLines, getFlowLine } from "../lib/flowline";
import { DEFAULT_SCORING } from "../lib/scoring";
import { received, SENDER, RECEIVER } from "./helpers";

describe("computeFlowLines", () => {
  it("builds a healthy, qualified line from regular recent remittances", () => {
    // 7 weekly payments, growing slightly, most recent yesterday
    const events = [84, 70, 56, 42, 28, 14, 1].map((d, i) => received(200 + i * 10, d));
    const lines = computeFlowLines(events, DEFAULT_SCORING);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line.id).toBe(`${SENDER}->${RECEIVER}`);
    expect(line.qualified).toBe(true);
    expect(line.qualifiedCount).toBe(7);
    expect(line.lineScore).toBeGreaterThan(70);
    expect(line.lineScore).toBeLessThanOrEqual(100);
    expect(line.health).toBe("healthy");
  });

  it("marks tiny sub-threshold payments as unqualified with a low score", () => {
    const events = [30, 20, 10].map((d) => received(5, d)); // $5 < $10 minimum
    const [line] = computeFlowLines(events, DEFAULT_SCORING);
    expect(line.qualified).toBe(false);
    expect(line.qualifiedCount).toBe(0);
    expect(line.lineScore).toBeLessThan(50);
    expect(line.health).toBe("at-risk");
  });

  it("flags a stale line (no recent activity) as at-risk", () => {
    const events = [180, 166, 152, 138].map((d) => received(200, d)); // all >130d old
    const [line] = computeFlowLines(events, DEFAULT_SCORING);
    expect(line.recency).toBeLessThan(20);
    expect(line.health).toBe("at-risk");
  });

  it("clamps every line score into 1..100", () => {
    const events = [60, 45, 30, 15, 2].map((d) => received(500, d));
    for (const line of computeFlowLines(events, DEFAULT_SCORING)) {
      expect(line.lineScore).toBeGreaterThanOrEqual(1);
      expect(line.lineScore).toBeLessThanOrEqual(100);
    }
  });

  it("getFlowLine resolves a specific pair and returns undefined otherwise", () => {
    const events = [40, 20, 5].map((d) => received(150, d));
    expect(getFlowLine(events, DEFAULT_SCORING, SENDER, RECEIVER)?.id).toBe(
      `${SENDER}->${RECEIVER}`
    );
    expect(getFlowLine(events, DEFAULT_SCORING, RECEIVER, SENDER)).toBeUndefined();
  });
});
