import { NextRequest, NextResponse } from "next/server";
import { clearEvents, logEvents } from "@/lib/events";
import { generateSeedEvents } from "@/lib/seed";

// Seeds the platform with fake activity for the demo/dashboard. Ungated like
// the rest of admin. body: { clear?: boolean }.
export async function POST(req: NextRequest) {
  let clear = true;
  try {
    const body = await req.json();
    clear = body?.clear !== false;
  } catch {
    // default clear=true
  }

  if (clear) await clearEvents();
  const events = generateSeedEvents();
  await logEvents(events);
  return NextResponse.json({ ok: true, inserted: events.length, cleared: clear });
}
