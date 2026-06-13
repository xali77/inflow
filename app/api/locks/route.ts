import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getStore } from "@/lib/store";
import { apyForTerm, type Lock, type LockTerm } from "@/lib/locks";
import { logEvent } from "@/lib/events";

const locksKey = (address: string) => `locks:${address.toLowerCase()}`;
const VALID_TERMS: LockTerm[] = [3, 6, 12];

/** A wallet's locks (newest first). */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  const locks = (await getStore().get<Lock[]>(locksKey(address))) ?? [];
  return NextResponse.json({ locks });
}

/** Create a mock lock. body: { address, amount, months }. */
export async function POST(req: NextRequest) {
  let body: { address?: string; amount?: string | number; months?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address } = body;
  const amount = Number(body.amount);
  const months = Number(body.months) as LockTerm;

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Valid address required" }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }
  if (!VALID_TERMS.includes(months)) {
    return NextResponse.json({ error: "Term must be 3, 6, or 12 months" }, { status: 400 });
  }

  const start = new Date();
  const matures = new Date(start);
  matures.setMonth(matures.getMonth() + months);

  const lock: Lock = {
    id: `${start.getTime()}`,
    amount: amount.toFixed(2),
    months,
    apy: apyForTerm(months),
    started_at: start.toISOString(),
    matures_at: matures.toISOString(),
  };

  const store = getStore();
  const key = locksKey(address);
  const existing = (await store.get<Lock[]>(key)) ?? [];
  await store.set(key, [lock, ...existing].slice(0, 50));

  await logEvent({
    type: "lock.created",
    address,
    amount_usd: amount,
    payload: { months, apy: lock.apy, matures_at: lock.matures_at },
  });

  return NextResponse.json({ lock });
}
