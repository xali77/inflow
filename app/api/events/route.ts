import { NextRequest, NextResponse } from "next/server";
import { getEmbeddedWallet } from "@/lib/privy";
import { logEvent } from "@/lib/events";

function bearer(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Client-emitted events (e.g. completed swaps from the LI.FI widget). The
// caller's wallet is resolved from their Privy token; only a safe subset of
// event types is accepted.
const ALLOWED = new Set(["swap.executed"]);

export async function POST(req: NextRequest) {
  const token = bearer(req);
  const wallet = token ? await getEmbeddedWallet(token) : null;
  if (!wallet) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type?: string; amount_usd?: number; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.type || !ALLOWED.has(body.type)) {
    return NextResponse.json({ error: "Unsupported event type" }, { status: 400 });
  }

  await logEvent({
    type: body.type,
    address: wallet.address,
    amount_usd: body.amount_usd,
    payload: body.payload,
  });
  return NextResponse.json({ ok: true });
}
