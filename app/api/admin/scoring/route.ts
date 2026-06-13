import { NextRequest, NextResponse } from "next/server";
import {
  getScoringConfig,
  setScoringConfig,
  type ScoringConfig,
} from "@/lib/scoring";

export async function GET() {
  return NextResponse.json({ config: await getScoringConfig() });
}

/** Save tuned FlowScore / FlowLine weights from the admin dashboard. */
export async function PUT(req: NextRequest) {
  let body: ScoringConfig;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.flowScore || !body?.flowLine || !body?.lending) {
    return NextResponse.json({ error: "flowScore, flowLine and lending are required" }, { status: 400 });
  }
  // Coerce to numbers, clamp 0–100 (weights/percent) or to a given range.
  const clamp = (v: unknown, hi = 100) => Math.max(0, Math.min(hi, Number(v) || 0));
  const config: ScoringConfig = {
    flowScore: {
      flowlines: clamp(body.flowScore.flowlines),
      liquidity: clamp(body.flowScore.liquidity),
      repayment: clamp(body.flowScore.repayment),
      integrity: clamp(body.flowScore.integrity),
      trading: clamp(body.flowScore.trading),
    },
    flowLine: {
      consistency: clamp(body.flowLine.consistency),
      longevity: clamp(body.flowLine.longevity),
      volume: clamp(body.flowLine.volume),
      growth: clamp(body.flowLine.growth),
      sensitivity: clamp(body.flowLine.sensitivity),
    },
    lending: {
      minCollateralBps: clamp(body.lending.minCollateralBps, 10000),
      maxCollateralBps: clamp(body.lending.maxCollateralBps, 10000),
      scoreFlowShare: clamp(body.lending.scoreFlowShare),
      minInterestBps: clamp(body.lending.minInterestBps, 10000),
      maxInterestBps: clamp(body.lending.maxInterestBps, 10000),
      durationDays: Math.max(1, Math.min(365, Number(body.lending.durationDays) || 30)),
    },
  };
  await setScoringConfig(config);
  return NextResponse.json({ config });
}
