"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy, useSessionSigners, useWallets } from "@privy-io/react-auth";
import Sidebar from "@/components/sidebar";
import {
  normalizeCardTransactions,
  normalizeLasoCards,
  type NormalizedLasoCard,
} from "@/lib/laso-cards";

type DisplayCard = NormalizedLasoCard;

const PRIVY_SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

type CardsResponse = {
  configured?: boolean;
  cards?: unknown;
  archivedCards?: unknown;
  intl?: unknown;
  us?: unknown;
  account?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pick(obj: unknown, keys: string[]) {
  if (!isRecord(obj)) return undefined;
  for (const k of keys) if (obj[k] != null) return obj[k];
  return undefined;
}

function normalizeServerCards(value: unknown): DisplayCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((card, index) => {
    const type = card.type === "us" ? "us" : "intl";
    const id = String(card.id ?? `${type}-${index}`);
    return {
      id,
      type,
      label: card.label != null ? String(card.label) : undefined,
      status: card.status != null ? String(card.status) : undefined,
      cardNumber:
        card.cardNumber != null ? String(card.cardNumber) : undefined,
      expMonth: card.expMonth != null ? String(card.expMonth) : undefined,
      expYear: card.expYear != null ? String(card.expYear) : undefined,
      expiry: card.expiry != null ? String(card.expiry) : undefined,
      cvv: card.cvv != null ? String(card.cvv) : undefined,
      balance:
        typeof card.balance === "number" || typeof card.balance === "string"
          ? card.balance
          : undefined,
      amount:
        typeof card.amount === "number"
          ? card.amount
          : Number.isFinite(Number(card.amount))
            ? Number(card.amount)
            : null,
      transactions: normalizeCardTransactions(card),
      archived: card.archived === true,
    };
  });
}

function safeCards(value: unknown): DisplayCard[] {
  return Array.isArray(value) ? value : [];
}

function safeTransactions(card: DisplayCard) {
  return Array.isArray(card.transactions) ? card.transactions : [];
}

function maskPan(pan: string) {
  const digits = pan.replace(/\s/g, "");
  return `•••• •••• •••• ${digits.slice(-4)}`;
}

function cardBalance(card: DisplayCard) {
  const balance = Number(card.balance);
  return Number.isFinite(balance) ? balance.toFixed(2) : null;
}

function txAmount(txn: DisplayCard["transactions"][number]) {
  if (txn.amount == null) return "—";
  const prefix = txn.isCredit === true ? "+" : txn.isCredit === false ? "-" : "";
  return `${prefix}${Math.abs(txn.amount).toFixed(2)}`;
}

function cardTitle(card: DisplayCard) {
  return `${card.label ?? (card.type === "intl" ? "International" : "U.S.")} card`;
}

export default function Cards() {
  const { ready, authenticated, getAccessToken, logout } = usePrivy();
  const { addSessionSigners } = useSessionSigners();
  const { wallets } = useWallets();
  const router = useRouter();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [cards, setCards] = useState<DisplayCard[]>([]);
  const [archivedCards, setArchivedCards] = useState<DisplayCard[]>([]);
  const [accountBalance, setAccountBalance] = useState<string | null>(null);
  const [amount, setAmount] = useState("100");
  const [type, setType] = useState<"intl" | "us">("intl");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const signerEnabledRef = useRef(false);

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  const embeddedWalletAddress =
    wallets.find((wallet) => wallet.walletClientType === "privy")?.address;

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(embeddedWalletAddress ? { "x-wallet-address": embeddedWalletAddress } : {}),
    };
  }, [getAccessToken, embeddedWalletAddress]);

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/cards", { headers: await authHeader() });
    return res.json();
  }, [authHeader]);

  // Applies fetched data to state (called from async callbacks, not the effect
  // body directly).
  const apply = useCallback(
    (d: CardsResponse) => {
      if (!d || !d.configured) {
        setConfigured(false);
        setCards([]);
        setArchivedCards([]);
        return;
      }
      setConfigured(true);
      const active = normalizeServerCards(d.cards);
      const archived = normalizeServerCards(d.archivedCards);
      setCards(
        Array.isArray(d.cards)
          ? active
          : [
              ...normalizeLasoCards(d.intl, "intl"),
              ...normalizeLasoCards(d.us, "us"),
            ]
      );
      setArchivedCards(archived);
      const bal = pick(d.account, ["account_balance", "balance"]);
      setAccountBalance(bal != null ? String(bal) : null);
    },
    []
  );

  const load = useCallback(async () => {
    try {
      apply(await fetchCards());
    } catch {
      setConfigured(true);
    }
  }, [fetchCards, apply]);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    fetchCards()
      .then((d) => {
        if (!cancelled) apply(d);
      })
      .catch(() => {
        if (!cancelled) setConfigured(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, fetchCards, apply]);

  const ensureSignerEnabled = useCallback(async () => {
    if (signerEnabledRef.current || !embeddedWalletAddress || !PRIVY_SIGNER_ID) {
      return;
    }

    try {
      await addSessionSigners({
        address: embeddedWalletAddress,
        signers: [{ signerId: PRIVY_SIGNER_ID }],
      });
      signerEnabledRef.current = true;
    } catch (e) {
      if (/duplicate|already/i.test(e instanceof Error ? e.message : "")) {
        signerEnabledRef.current = true;
        return;
      }
      throw e;
    }
  }, [addSessionSigners, embeddedWalletAddress]);

  const order = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureSignerEnabled();
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ amount: Number(amount), type }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Order failed");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setBusy(false);
    }
  }, [amount, type, authHeader, ensureSignerEnabled, load]);

  const refresh = useCallback(
    async (
      card: DisplayCard,
      action: "refresh" | "cancel" | "archive" | "unarchive"
    ) => {
      setError(null);
      setBusy(true);
      try {
        const res = await fetch("/api/cards/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({
            action,
            card_id: card.id,
            type: card.type,
            card_type:
              card.type === "intl"
                ? "Non-Reloadable International"
                : "Non-Reloadable U.S.",
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Request failed");
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(false);
      }
    },
    [authHeader, load]
  );

  if (!ready || !authenticated || configured === null) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center">
        <p className="text-ink-soft text-sm">Loading…</p>
      </main>
    );
  }

  const charged =
    type === "intl"
      ? (Number(amount) * 1.038).toFixed(2)
      : Number(amount).toFixed(2);
  const activeCards = safeCards(cards);
  const archivedList = safeCards(archivedCards);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:hidden">
          <span className="flex items-center gap-2 font-medium">
            <Image src="/logo.png" alt="Flows" width={24} height={24} className="rounded-md" />
            Flows
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/home")}
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft"
            >
              Home
            </button>
            <button
              onClick={logout}
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft"
            >
              Log out
            </button>
          </div>
        </div>

        <main className="mx-auto max-w-3xl px-5 py-6 lg:px-10 lg:py-9">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">Cards</h1>

          {configured === false ? (
        <div className="card p-5">
          <p className="text-sm">Cards aren&rsquo;t set up yet</p>
          <p className="text-ink-soft mt-2 text-xs">
            Cards are paid from your own wallet via Privy. Configure the Privy
            server keys (PRIVY_APP_SECRET + PRIVY_AUTHORIZATION_PRIVATE_KEY) to
            enable card issuing.
          </p>
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          {accountBalance != null && (
            <p className="text-ink-soft text-sm">
              Laso balance:{" "}
              <span className="text-ink tabular-nums">{accountBalance} USDC</span>
            </p>
          )}

          <div className="card p-5">
            <p className="mb-1 text-sm font-medium">Order a card</p>
            <p className="text-ink-soft mb-3 text-xs">
              Paid from your own wallet. Enable Grow once to authorize payments.
            </p>
            <div className="mb-3 grid grid-cols-2 gap-3">
              {(["intl", "us"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setType(t);
                    setAmount(t === "intl" ? "100" : "5");
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    type === t
                      ? "border-ink bg-ground text-ink"
                      : "border-line text-ink-soft hover:border-ink-soft/40"
                  }`}
                >
                  {t === "intl" ? "International" : "U.S."}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-ink-soft text-sm">
                On-card amount (USD)
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                inputMode="decimal"
                className="rounded-xl border border-line bg-ground px-4 py-3 tabular-nums text-ink focus:outline-none"
              />
            </label>
            <p className="text-ink-soft mt-2 text-xs">
              You pay ~{charged} USDC{type === "intl" ? " (incl. 3.8% fee)" : ""}.
              {type === "intl"
                ? " International cards are fulfilled by Laso within ~24h."
                : " U.S. card is ready in ~10s."}
            </p>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <button
              onClick={order}
              disabled={busy || Number(amount) < (type === "intl" ? 100 : 5)}
              className="mt-4 w-full rounded-xl border border-line bg-ground px-4 py-3 font-medium text-ink transition-colors hover:border-ink-soft/40 disabled:opacity-50"
            >
              {busy ? "Ordering…" : `Order ${type === "intl" ? "international" : "U.S."} card`}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <p className="eyebrow mt-2">Your cards</p>
            {activeCards.length === 0 ? (
              <p className="card px-4 py-6 text-center text-sm text-ink-soft">
                No cards yet.
              </p>
            ) : (
              activeCards.map((card) => {
                const isReady = !!card.cardNumber;
                const show = revealed[card.id];
                const balance = cardBalance(card);
                const status = card.status?.toLowerCase();
                const canCancel =
                  card.type === "intl" &&
                  (status === "queued" || status === "pending");
                const transactions = safeTransactions(card);
                return (
                  <div key={`${card.type}-${card.id}`} className="card p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{cardTitle(card)}</span>
                      {card.status && (
                        <span className="text-ink-soft rounded-full border border-line px-2 py-0.5 text-xs">
                          {card.status}
                        </span>
                      )}
                    </div>

                    {balance != null && (
                      <p className="mt-2 text-2xl font-semibold tabular-nums">
                        {balance}{" "}
                        <span className="text-ink-soft text-sm">USDC</span>
                      </p>
                    )}

                    {isReady ? (
                      <div className="mt-3 space-y-1 text-sm tabular-nums">
                        <p>{show ? card.cardNumber : maskPan(card.cardNumber!)}</p>
                        <p className="text-ink-soft text-xs">
                          Exp {card.expiry ?? "—"} · CVV{" "}
                          {show ? (card.cvv ?? "—") : "•••"}
                        </p>
                        <button
                          onClick={() =>
                            setRevealed((r) => ({ ...r, [card.id]: !r[card.id] }))
                          }
                          className="text-ink-soft text-xs underline"
                        >
                          {show ? "Hide details" : "Reveal details"}
                        </button>
                      </div>
                    ) : (
                      <p className="text-ink-soft mt-2 text-xs">
                        Card details appear once the order is fulfilled.
                      </p>
                    )}

                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-ink-soft mb-2 text-xs">
                        Transactions
                      </p>
                      {transactions.length === 0 ? (
                        <p className="text-ink-soft text-xs">
                          No transactions yet.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {transactions.slice(0, 5).map((txn, index) => (
                            <div
                              key={`${card.id}-txn-${index}`}
                              className="flex items-start justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-ink">
                                  {txn.description ?? "Card transaction"}
                                </p>
                                {txn.date && (
                                  <p className="text-ink-soft tabular-nums">
                                    {txn.date}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 tabular-nums text-ink">
                                {txAmount(txn)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex gap-4 text-xs">
                      <button
                        onClick={() => refresh(card, "refresh")}
                        disabled={busy}
                        className="text-ink-soft hover:text-ink"
                      >
                        Refresh balance
                      </button>
                      {canCancel && (
                        <button
                          onClick={() => refresh(card, "cancel")}
                          disabled={busy}
                          className="text-ink-soft hover:text-ink"
                        >
                          Cancel order
                        </button>
                      )}
                      <button
                        onClick={() => refresh(card, "archive")}
                        disabled={busy}
                        className="text-ink-soft hover:text-ink"
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {archivedList.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="eyebrow mt-2">Archived cards</p>
              {archivedList.map((card) => {
                const balance = cardBalance(card);
                const transactions = safeTransactions(card);
                return (
                  <div key={`archived-${card.type}-${card.id}`} className="card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{cardTitle(card)}</p>
                        <p className="text-ink-soft mt-1 text-xs tabular-nums">
                          {card.cardNumber ? maskPan(card.cardNumber) : card.id}
                        </p>
                      </div>
                      {balance != null && (
                        <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                          {balance} USDC
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink-soft">
                        {transactions.length} transaction
                        {transactions.length === 1 ? "" : "s"}
                      </span>
                      <button
                        onClick={() => refresh(card, "unarchive")}
                        disabled={busy}
                        className="text-ink-soft hover:text-ink"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
          )}
        </main>
      </div>
    </div>
  );
}
