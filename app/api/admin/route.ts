import { NextResponse } from "next/server";
import { listEvents } from "@/lib/events";
import { getScoringConfig } from "@/lib/scoring";
import { computeAnalytics } from "@/lib/analytics";

// Admin dashboard data: full analytics + FlowScores computed from the event log
// using the current scoring weights. Ungated for the hackathon.
export async function GET() {
  const [events, config] = await Promise.all([listEvents(5000), getScoringConfig()]);
  const analytics = computeAnalytics(events, config);
  return NextResponse.json({ ...analytics, config });
}
