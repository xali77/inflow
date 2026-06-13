import { NextRequest, NextResponse } from "next/server";
import { getEmbeddedWallet } from "@/lib/privy";
import {
  INTL_CARD_TYPE,
  US_CARD_TYPE,
  getAccountBalance,
  getCardData,
  isLasoConfigured,
  orderIntlCard,
  orderUsCard,
} from "@/lib/laso";

function bearer(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Every route resolves the caller's own Privy embedded wallet — cards are paid
// from that wallet, so the request must be from an authenticated user.
async function requireWallet(req: NextRequest) {
  const token = bearer(req);
  if (!token) return null;
  return getEmbeddedWallet(token);
}

/** Lists the user's cards (US + international) and their Laso account balance. */
export async function GET(req: NextRequest) {
  if (!isLasoConfigured()) return NextResponse.json({ configured: false });
  const wallet = await requireWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [intl, us, balance] = await Promise.allSettled([
      getCardData(wallet, INTL_CARD_TYPE),
      getCardData(wallet, US_CARD_TYPE),
      getAccountBalance(wallet),
    ]);
    return NextResponse.json({
      configured: true,
      intl: intl.status === "fulfilled" ? intl.value : null,
      us: us.status === "fulfilled" ? us.value : null,
      account: balance.status === "fulfilled" ? balance.value : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load cards";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Orders a card. body: { amount, type: "intl" | "us" }. */
export async function POST(req: NextRequest) {
  if (!isLasoConfigured()) {
    return NextResponse.json({ error: "Cards are not configured" }, { status: 503 });
  }
  const wallet = await requireWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { amount?: number; type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const amount = Number(body.amount);
  const type = body.type === "us" ? "us" : "intl";
  const min = type === "intl" ? 100 : 5;
  if (!amount || amount < min || amount > 1000) {
    return NextResponse.json(
      { error: `Amount must be between $${min} and $1000` },
      { status: 400 }
    );
  }

  try {
    const result =
      type === "intl"
        ? await orderIntlCard(wallet, amount)
        : await orderUsCard(wallet, amount);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Order failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
