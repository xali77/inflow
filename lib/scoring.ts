import { getStore } from "./store";

// Tunable weights that govern how each behavior affects FlowScore and the
// per-counterparty FlowLine score. Editable from the admin dashboard and
// persisted in the kv store. The live computation engine reads these (built
// later) — for now they're the configurable knobs.
export type ScoringConfig = {
  // FlowScore: how much each domain contributes (relative weights, 0–100).
  flowScore: {
    flowlines: number; // recurring remittance inflows
    liquidity: number; // grow/lock/savings behavior
    repayment: number; // credit repayment (future)
    integrity: number; // World ID, anti-sybil
    trading: number; // hold/swap behavior (now score-bearing)
  };
  // FlowLine: how a single remittance relationship is scored.
  flowLine: {
    consistency: number; // regular cadence
    longevity: number; // months active
    volume: number; // total received
    growth: number; // increasing over time
    // 0–100: how reactive the LineScore is to recent activity, and how wide the
    // lending collateral band swings with the score. Higher = a missed
    // remittance drops the line faster and collateral reacts more sharply.
    sensitivity: number;
  };
  // Lending policy — the score→terms curve, fully admin-tunable (enforced
  // off-chain at quote time via the signed terms, so changes are instant).
  lending: {
    minCollateralBps: number; // collateral at top combined score (e.g. 5000 = 50%)
    maxCollateralBps: number; // collateral at bottom score (e.g. 7500 = 75%)
    scoreFlowShare: number; // 0–100: weight of sender FlowScore vs LineScore in the combined score
    minInterestBps: number; // interest at top score (e.g. 800 = 8%)
    maxInterestBps: number; // interest at bottom score (e.g. 2000 = 20%)
    durationDays: number; // loan term
  };
};

export const DEFAULT_SCORING: ScoringConfig = {
  flowScore: { flowlines: 40, liquidity: 20, repayment: 20, integrity: 12, trading: 8 },
  flowLine: { consistency: 35, longevity: 25, volume: 25, growth: 15, sensitivity: 50 },
  lending: {
    minCollateralBps: 5000,
    maxCollateralBps: 7500,
    scoreFlowShare: 60,
    minInterestBps: 800,
    maxInterestBps: 2000,
    durationDays: 30,
  },
};

const KEY = "scoring:config";

export async function getScoringConfig(): Promise<ScoringConfig> {
  const stored = await getStore().get<Partial<ScoringConfig>>(KEY);
  if (!stored) return DEFAULT_SCORING;
  // Merge over defaults so older saved configs gain new sections/fields.
  return {
    flowScore: { ...DEFAULT_SCORING.flowScore, ...stored.flowScore },
    flowLine: { ...DEFAULT_SCORING.flowLine, ...stored.flowLine },
    lending: { ...DEFAULT_SCORING.lending, ...stored.lending },
  };
}

export async function setScoringConfig(config: ScoringConfig): Promise<void> {
  await getStore().set(KEY, config);
}
