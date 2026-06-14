import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCORING,
  sanitizeScoringConfig,
  flowScoreFromRaw,
  normalizeFlowScore,
  flowScoreBand,
} from "../lib/scoring";

describe("sanitizeScoringConfig", () => {
  it("returns defaults for empty input", () => {
    const c = sanitizeScoringConfig(null);
    expect(c.flowScore.scale).toEqual({ min: 300, max: 850 });
    expect(c.lending.minCollateralBps).toBe(5000);
    expect(c.flowLine.amount).toBe(25);
  });

  it("clamps out-of-range values and keeps untouched defaults", () => {
    const c = sanitizeScoringConfig({
      // @ts-expect-error partial override for the test
      flowScore: { flowlines: 9999 },
      // @ts-expect-error partial override for the test
      lending: { protocolFeeBps: -50, minCollateralBps: 4000 },
    });
    expect(c.flowScore.flowlines).toBe(100); // clamped to max 100
    expect(c.lending.protocolFeeBps).toBe(0); // clamped to min 0
    expect(c.lending.minCollateralBps).toBe(4000); // valid override kept
    expect(c.flowLine.cadence).toBe(DEFAULT_SCORING.flowLine.cadence); // default preserved
  });
});

describe("flowScore scale mapping", () => {
  it("maps raw 0..100 onto the 300..850 scale", () => {
    expect(flowScoreFromRaw(0, DEFAULT_SCORING)).toBe(300);
    expect(flowScoreFromRaw(100, DEFAULT_SCORING)).toBe(850);
    expect(flowScoreFromRaw(50, DEFAULT_SCORING)).toBe(575);
  });

  it("normalizeFlowScore inverts the mapping", () => {
    expect(normalizeFlowScore(300, DEFAULT_SCORING)).toBe(0);
    expect(normalizeFlowScore(850, DEFAULT_SCORING)).toBe(100);
    expect(Math.round(normalizeFlowScore(575, DEFAULT_SCORING))).toBe(50);
  });

  it("assigns the right band", () => {
    expect(flowScoreBand(820, DEFAULT_SCORING)).toBe("Excellent");
    expect(flowScoreBand(760, DEFAULT_SCORING)).toBe("Very Good");
    expect(flowScoreBand(700, DEFAULT_SCORING)).toBe("Good");
    expect(flowScoreBand(600, DEFAULT_SCORING)).toBe("Fair");
    expect(flowScoreBand(400, DEFAULT_SCORING)).toBe("Poor");
  });
});
