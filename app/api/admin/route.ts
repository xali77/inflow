import { NextResponse } from "next/server";
import { listEvents, summarize } from "@/lib/events";
import { getScoringConfig } from "@/lib/scoring";

// Admin dashboard data: recent events, aggregate stats, and current scoring
// weights. Ungated for the hackathon — do not expose publicly in production.
export async function GET() {
  const events = await listEvents(300);
  const stats = summarize(events);
  const config = await getScoringConfig();
  return NextResponse.json({ stats, events: events.slice(0, 60), config });
}
