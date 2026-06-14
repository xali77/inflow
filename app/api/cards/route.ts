import { NextRequest, NextResponse } from "next/server";
import type { Address } from "viem";
import { getEmbeddedWallet } from "@/lib/privy";
import { logEvent } from "@/lib/events";
import { getStore } from "@/lib/store";
import { getBaseUsdcBalance } from "@/lib/balance";
import { normalizeLasoCards, type CardKind } from "@/lib/laso-cards";
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

const signerId =
  process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID ?? process.env.PRIVY_SIGNER_ID ?? "";

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

async function archivedFor(address: string) {
  return normalizeArchived(await getStore().get<unknown>(archivedKey(address)));
}

function archiveSet(archived: ArchivedCard[]) {
  return new Set(archived.map((card) => `${card.type}:${card.id}`));
}

// Every route resolves the caller's own Privy embedded wallet — cards are paid
// from that wallet, so the request must be from an authenticated user.
async function requireWallet(req: NextRequest) {
  const token = bearer(req);
  if (!token) return null;
  return getEmbeddedWallet(token, req.headers.get("x-wallet-address"));
}

async function walletStatus(wallet: NonNullable<Awaited<ReturnType<typeof requireWallet>>>) {
  const baseUsdcBalance = await getBaseUsdcBalance(wallet.address as Address);
  return {
    address: wallet.address,
    delegated: wallet.delegated === true,
    walletClientType: wallet.walletClientType,
    baseUsdcBalance,
    signerIdConfigured: Boolean(signerId),
  };
}

function requiredPayment(amount: number, type: CardKind) {
  return type === "intl" ? amount * 1.038 : amount;
}

/** Lists the user's cards (US + international) and their Laso account balance. */
export async function GET(req: NextRequest) {
  if (!isLasoConfigured()) {
    return NextResponse.json({
      configured: false,
      signerIdConfigured: Boolean(signerId),
    });
  }
  const wallet = await requireWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [intl, us, balance, status] = await Promise.allSettled([
      getCardData(wallet, INTL_CARD_TYPE),
      getCardData(wallet, US_CARD_TYPE),
      getAccountBalance(wallet),
      walletStatus(wallet),
    ]);
    const archived = await archivedFor(wallet.address);
    const archivedIds = archiveSet(archived);
    const allCards = [
      ...normalizeLasoCards(
        intl.status === "fulfilled" ? intl.value : null,
        "intl",
        new Set(
          [...archivedIds]
            .filter((id) => id.startsWith("intl:"))
            .map((id) => id.slice("intl:".length))
        )
      ),
      ...normalizeLasoCards(
        us.status === "fulfilled" ? us.value : null,
        "us",
        new Set(
          [...archivedIds]
            .filter((id) => id.startsWith("us:"))
            .map((id) => id.slice("us:".length))
        )
      ),
    ];
    return NextResponse.json({
      configured: true,
      signerId,
      signerIdConfigured: Boolean(signerId),
      wallet: status.status === "fulfilled" ? status.value : undefined,
      intl: intl.status === "fulfilled" ? intl.value : null,
      us: us.status === "fulfilled" ? us.value : null,
      account: balance.status === "fulfilled" ? balance.value : null,
      cards: allCards.filter((card) => !card.archived),
      archivedCards: allCards.filter((card) => card.archived),
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
    if (!signerId) {
      return NextResponse.json(
        {
          error:
            "Missing Privy signer id. Set PRIVY_SIGNER_ID or NEXT_PUBLIC_PRIVY_SIGNER_ID, then restart the app.",
          code: "PRIVY_SIGNER_ID_MISSING",
        },
        { status: 503 }
      );
    }

    if (wallet.delegated === false) {
      return NextResponse.json(
        {
          error:
            "Card payments are not enabled for this embedded wallet yet. Click Enable card payments, approve the Privy signer, then order again.",
          code: "PRIVY_SIGNER_NOT_DELEGATED",
          signerId,
          wallet: await walletStatus(wallet),
        },
        { status: 409 }
      );
    }

    const baseUsdcBalance = Number(await getBaseUsdcBalance(wallet.address as Address));
    const required = requiredPayment(amount, type);
    if (!Number.isFinite(baseUsdcBalance) || baseUsdcBalance + 1e-9 < required) {
      return NextResponse.json(
        {
          error: `Embedded Privy wallet ${wallet.address} has ${baseUsdcBalance.toFixed(
            2
          )} Base USDC, but this ${type === "us" ? "U.S." : "international"} card needs at least ${required.toFixed(
            2
          )} Base USDC.`,
          code: "INSUFFICIENT_BASE_USDC",
          wallet: {
            ...(await walletStatus(wallet)),
            requiredBaseUsdc: required.toFixed(2),
          },
        },
        { status: 402 }
      );
    }

    const result =
      type === "intl"
        ? await orderIntlCard(wallet, amount)
        : await orderUsCard(wallet, amount);
    await logEvent({
      type: "card.order",
      address: wallet.address,
      amount_usd: amount,
      payload: { card_type: type },
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Order failed";
    const paymentRejected = message.includes("failed 402");
    return NextResponse.json(
      {
        error: message,
        code: paymentRejected ? "LASO_PAYMENT_REJECTED" : "CARD_ORDER_FAILED",
        wallet: await walletStatus(wallet).catch(() => undefined),
      },
      { status: paymentRejected ? 402 : 500 }
    );
  }
}
