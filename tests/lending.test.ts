import { describe, it, expect } from "vitest";
import { computeTerms, projectPoolApr } from "../lib/lending";
import { DEFAULT_SCORING } from "../lib/scoring";
import type { Analytics } from "../lib/analytics";
import { SENDER, RECEIVER, ago } from "./helpers";

// Minimal analytics fixture with only the fields computeTerms reads.
function analyticsWith(opts: {
  receiverScore: number;
  senderScore: number;
  line?: { lineScore: number; qualified: boolean; qualifiedTotal: number };
}): Analytics {
  return {
    users: [
      { address: RECEIVER, flowScore: opts.receiverScore },
      { address: SENDER, flowScore: opts.senderScore },
    ],
    flowLines: opts.line
      ? [
          {
            id: `${SENDER}->${RECEIVER}`,
            lineScore: opts.line.lineScore,
            qualified: opts.line.qualified,
            qualifiedTotal: opts.line.qualifiedTotal,
            firstActivity: ago(60),
          },
        ]
      : [],
  } as unknown as Analytics;
}

describe("computeTerms", () => {
  it("approves a strong sender/receiver/line and prices collateral in-band", () => {
    const analytics = analyticsWith({
      receiverScore: 720,
      senderScore: 700,
      line: { lineScore: 80, qualified: true, qualifiedTotal: 1500 },
    });
    const t = computeTerms({ sender: SENDER, receiver: RECEIVER, amount: 100, analytics, config: DEFAULT_SCORING });
    expect(t.eligible).toBe(true);
    expect(t.collateralBps).toBeGreaterThanOrEqual(DEFAULT_SCORING.lending.minCollateralBps);
    expect(t.collateralBps).toBeLessThanOrEqual(DEFAULT_SCORING.lending.maxCollateralBps);
    expect(t.riskScore).toBeGreaterThan(60);
    expect(t.interest).toBeGreaterThan(0);
    expect(t.collateral).toBeCloseTo((100 * t.collateralBps) / 10000, 2);
  });

  it("declines when there is no FlowLine with the sender", () => {
    const analytics = analyticsWith({ receiverScore: 720, senderScore: 700 });
    const t = computeTerms({ sender: SENDER, receiver: RECEIVER, amount: 100, analytics, config: DEFAULT_SCORING });
    expect(t.eligible).toBe(false);
    expect(t.reason).toMatch(/FlowLine/i);
  });

  it("declines a receiver below the minimum FlowScore", () => {
    const analytics = analyticsWith({
      receiverScore: 500, // < minReceiverScore 580
      senderScore: 700,
      line: { lineScore: 80, qualified: true, qualifiedTotal: 1500 },
    });
    const t = computeTerms({ sender: SENDER, receiver: RECEIVER, amount: 100, analytics, config: DEFAULT_SCORING });
    expect(t.eligible).toBe(false);
    expect(t.reason).toMatch(/Receiver FlowScore/i);
  });

  it("caps the principal at the FlowLine limit", () => {
    const analytics = analyticsWith({
      receiverScore: 720,
      senderScore: 700,
      line: { lineScore: 80, qualified: true, qualifiedTotal: 200 },
    });
    const t = computeTerms({ sender: SENDER, receiver: RECEIVER, amount: 100000, analytics, config: DEFAULT_SCORING });
    expect(t.eligible).toBe(false);
    expect(t.reason).toMatch(/limit/i);
    expect(t.maxEligiblePrincipal).toBeGreaterThan(0);
  });

  it("lower risk → less collateral than higher risk", () => {
    const strong = computeTerms({
      sender: SENDER, receiver: RECEIVER, amount: 100, config: DEFAULT_SCORING,
      analytics: analyticsWith({ receiverScore: 800, senderScore: 800, line: { lineScore: 95, qualified: true, qualifiedTotal: 5000 } }),
    });
    const weak = computeTerms({
      sender: SENDER, receiver: RECEIVER, amount: 100, config: DEFAULT_SCORING,
      analytics: analyticsWith({ receiverScore: 600, senderScore: 600, line: { lineScore: 55, qualified: true, qualifiedTotal: 5000 } }),
    });
    expect(strong.collateralBps).toBeLessThan(weak.collateralBps);
  });
});

describe("projectPoolApr", () => {
  it("returns a coherent LP projection", () => {
    const p = projectPoolApr(DEFAULT_SCORING, { utilizationBps: 6000, riskScore: 70 });
    expect(p.borrowerAprBps).toBeGreaterThan(0);
    expect(p.probabilityOfDefaultBps).toBeGreaterThan(0);
    expect(p.collateralBps).toBeGreaterThanOrEqual(DEFAULT_SCORING.lending.minCollateralBps);
    expect(typeof p.projectedLpAprBps).toBe("number");
  });
});
