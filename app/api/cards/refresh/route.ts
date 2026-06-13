import { NextRequest, NextResponse } from "next/server";
import { getEmbeddedWallet } from "@/lib/privy";
import { isLasoConfigured, refreshCardData, cancelIntlOrder } from "@/lib/laso";
import { getStore } from "@/lib/store";
import type { CardKind } from "@/lib/laso-cards";

function bearer(req: NextRequest) {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

const archivedKey = (address: string) =>
  `cards:archived:${address.toLowerCase()}`;

type ArchivedCard = {
  id: string;
  type: CardKind;
  archivedAt: string;
};

function normalizeArchived(value: unknown): ArchivedCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((card) => {
    if (!card || typeof card !== "object") return [];
    const record = card as Record<string, unknown>;
    const type = record.type === "us" ? "us" : "intl";
    return record.id
      ? [{ id: String(record.id), type, archivedAt: String(record.archivedAt ?? "") }]
      : [];
  });
}

function cardKind(body: { type?: string; card_type?: string }): CardKind {
  if (body.type === "us" || body.card_type?.includes("U.S.")) return "us";
  return "intl";
}

async function setArchived(
  address: string,
  cardId: string,
  type: CardKind,
  archived: boolean
) {
  const store = getStore();
  const key = archivedKey(address);
  const existing = normalizeArchived(await store.get<unknown>(key));
  const next = existing.filter(
    (card) => !(card.id === cardId && card.type === type)
  );
  if (archived) {
    next.unshift({ id: cardId, type, archivedAt: new Date().toISOString() });
  }
  await store.set(key, next.slice(0, 200));
  return next;
}

/**
 * Card maintenance. action: "refresh" requests a balance refresh; "cancel"
 * cancels a queued international order (refund to Laso account balance).
 */
export async function POST(req: NextRequest) {
  if (!isLasoConfigured()) {
    return NextResponse.json({ error: "Cards are not configured" }, { status: 503 });
  }
  const token = bearer(req);
  const wallet = token ? await getEmbeddedWallet(token) : null;
  if (!wallet) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    action?: string;
    card_id?: string;
    card_type?: string;
    type?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.card_id) {
    return NextResponse.json({ error: "card_id is required" }, { status: 400 });
  }

  try {
    if (body.action === "archive" || body.action === "unarchive") {
      return NextResponse.json({
        ok: true,
        archived: body.action === "archive",
        result: await setArchived(
          wallet.address,
          body.card_id,
          cardKind(body),
          body.action === "archive"
        ),
      });
    }

    if (body.action === "cancel") {
      return NextResponse.json({
        ok: true,
        result: await cancelIntlOrder(wallet, body.card_id),
      });
    }
    const result = await refreshCardData(
      wallet,
      body.card_id,
      body.card_type ?? "Non-Reloadable International"
    );
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
