import { describe, it, expect } from "vitest";
import { computeAnalytics } from "../lib/analytics";
import { DEFAULT_SCORING } from "../lib/scoring";
import { ev, received, ago, SENDER, RECEIVER } from "./helpers";

function baseEvents() {
  return [
    ev({ type: "onboarding.completed", address: RECEIVER, created_at: ago(90), payload: { country: "PH", role: "receiver", name: "Bob" } }),
    ev({ type: "onboarding.completed", address: SENDER, created_at: ago(95), payload: { country: "US", role: "sender", name: "Alice" } }),
    ev({ type: "identity.verified", address: RECEIVER, created_at: ago(89) }),
    // sent mirror entries (so SENDER is also a user)
    ...[84, 70, 56, 42, 28, 14, 1].flatMap((d, i) => [
      received(200 + i * 10, d),
      ev({ type: "remittance.sent", address: SENDER, amount_usd: 200 + i * 10, created_at: ago(d), payload: { to: RECEIVER } }),
    ]),
    ev({ type: "grow.deposit", address: RECEIVER, amount_usd: 300, created_at: ago(20), payload: {} }),
  ];
}

describe("computeAnalytics", () => {
  it("produces sensible top-level stats", () => {
    const a = computeAnalytics(baseEvents(), DEFAULT_SCORING);
    expect(a.stats.users).toBe(2);
    expect(a.stats.verifiedPct).toBe(50);
    expect(a.stats.flowLines).toBeGreaterThanOrEqual(1);
    expect(a.stats.remittanceVolume).toBeGreaterThan(0);
  });

  it("keeps every FlowScore inside the configured scale", () => {
    const { users } = computeAnalytics(baseEvents(), DEFAULT_SCORING);
    for (const u of users) {
      expect(u.flowScore).toBeGreaterThanOrEqual(DEFAULT_SCORING.flowScore.scale.min);
      expect(u.flowScore).toBeLessThanOrEqual(DEFAULT_SCORING.flowScore.scale.max);
    }
  });

  it("the score distribution buckets every user exactly once", () => {
    const a = computeAnalytics(baseEvents(), DEFAULT_SCORING);
    const sum = a.scoreDistribution.reduce((s, b) => s + b.count, 0);
    expect(sum).toBe(a.users.length);
  });

  it("rewards a verified receiver with steady inflows over the bare-minimum sender", () => {
    const a = computeAnalytics(baseEvents(), DEFAULT_SCORING);
    const receiver = a.users.find((u) => u.address === RECEIVER)!;
    const sender = a.users.find((u) => u.address === SENDER)!;
    expect(receiver.verified).toBe(true);
    expect(receiver.flowScore).toBeGreaterThan(sender.flowScore);
  });
});
