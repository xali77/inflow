"use client";

/* Token logos come from arbitrary remote URLs (LI.FI token list); next/image
   would require whitelisting every host, so a plain <img> is intentional. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { usePrivy, useSendTransaction } from "@privy-io/react-auth";
import {
  BASE_CHAIN,
  USDC_BASE,
  getQuote,
  getTokens,
  type LifiQuote,
  type LifiToken,
} from "@/lib/lifi";

const pub = createPublicClient({ chain: base, transport: http() });
const USDC_DECIMALS = 6;
const SLIPPAGE = 0.01; // 1% — resilient on multi-hop routes

// A few sensible defaults surfaced first in the picker (CEX-style).
const POPULAR = ["WETH", "ETH", "cbBTC", "DEGEN", "DAI", "USDbC", "AERO"];

type Status =
  | { state: "idle" }
  | { state: "quoting" }
  | { state: "approving" }
  | { state: "swapping" }
  | { state: "done"; hash: string }
  | { state: "error"; message: string };

const fmt = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function SwapModal({
  open,
  onClose,
  address,
}: {
  open: boolean;
  onClose: () => void;
  address?: string;
}) {
  const { getAccessToken } = usePrivy();
  const { sendTransaction } = useSendTransaction();

  const [tokens, setTokens] = useState<LifiToken[]>([]);
  const [toToken, setToToken] = useState<LifiToken | null>(null);
  const [amount, setAmount] = useState("");
  const [walletUsdc, setWalletUsdc] = useState(0);
  const [quote, setQuote] = useState<LifiQuote | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const quoteSeq = useRef(0);

  const refreshBalance = useCallback(() => {
    if (!address) return;
    pub
      .readContract({
        address: USDC_BASE as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as Address],
      })
      .then((raw) => setWalletUsdc(Number(formatUnits(raw as bigint, USDC_DECIMALS))))
      .catch(() => {});
  }, [address]);

  // Load Base tokens + wallet USDC balance when opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getTokens(BASE_CHAIN).then((list) => {
      if (cancelled) return;
      setTokens(list);
      setToToken((cur) => cur ?? list.find((t) => t.symbol === "WETH") ?? list[0] ?? null);
    });
    refreshBalance();
    return () => {
      cancelled = true;
    };
  }, [open, address, refreshBalance]);

  // Debounced quote whenever amount / target token changes.
  useEffect(() => {
    const ready = open && !!address && !!toToken && Number(amount) > 0;
    if (!ready) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuote(null);
      return;
    }
    const seq = ++quoteSeq.current;
    setStatus({ state: "quoting" });
    const t = setTimeout(async () => {
      try {
        const q = await getQuote({
          fromToken: USDC_BASE,
          toToken: toToken!.address,
          fromAmount: parseUnits(amount, USDC_DECIMALS).toString(),
          fromAddress: address!,
          slippage: SLIPPAGE,
        });
        if (seq !== quoteSeq.current) return;
        setQuote(q);
        setStatus({ state: "idle" });
      } catch (e) {
        if (seq !== quoteSeq.current) return;
        setQuote(null);
        setStatus({ state: "error", message: e instanceof Error ? e.message : "No route" });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [open, address, toToken, amount]);

  const reset = useCallback(() => {
    setAmount("");
    setQuote(null);
    setStatus({ state: "idle" });
    setPickerOpen(false);
    setSearch("");
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const doSwap = useCallback(async () => {
    if (!quote || !address || !toToken) return;
    try {
      const amt = parseUnits(amount, USDC_DECIMALS);
      const spender = quote.estimate.approvalAddress as Address;

      // 1) Ensure the LI.FI router can pull USDC (standard ERC-20 approve).
      const allowance = (await pub.readContract({
        address: USDC_BASE as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address as Address, spender],
      })) as bigint;

      if (allowance < amt) {
        setStatus({ state: "approving" });
        const { hash: approveHash } = await sendTransaction({
          to: USDC_BASE as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, amt],
          }),
          chainId: BASE_CHAIN,
        });
        await pub.waitForTransactionReceipt({ hash: approveHash as `0x${string}` });
      }

      // 2) Re-quote right before executing — the approval cost a block, so the
      // original quote's minReceived is stale and would revert. A fresh quote's
      // transactionRequest reflects current price.
      setStatus({ state: "swapping" });
      const fresh = await getQuote({
        fromToken: USDC_BASE,
        toToken: toToken.address,
        fromAmount: amt.toString(),
        fromAddress: address,
        slippage: SLIPPAGE,
      });
      const tx = fresh.transactionRequest;
      const { hash } = await sendTransaction({
        to: tx.to as Address,
        data: tx.data as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : undefined,
        chainId: BASE_CHAIN,
      });

      // 3) Confirm it actually succeeded on-chain (not just submitted).
      const receipt = await pub.waitForTransactionReceipt({ hash: hash as `0x${string}` });
      if (receipt.status !== "success") {
        throw new Error("Swap reverted on-chain — price moved. Try again.");
      }

      setStatus({ state: "done", hash });
      refreshBalance();

      // Log the swap as score-bearing trading behavior (best-effort).
      const token = await getAccessToken();
      fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type: "swap.executed",
          amount_usd: Number(fresh.estimate.fromAmountUSD ?? 0),
          payload: {
            fromToken: "USDC",
            toToken: toToken.symbol,
            fromChain: BASE_CHAIN,
            toChain: BASE_CHAIN,
            hash,
          },
        }),
      }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Swap failed";
      setStatus({ state: "error", message: msg });
    }
  }, [quote, address, amount, toToken, sendTransaction, getAccessToken, refreshBalance]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const score = (t: LifiToken) =>
      POPULAR.indexOf(t.symbol) === -1 ? 99 : POPULAR.indexOf(t.symbol);
    const list = q
      ? tokens.filter(
          (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.address.toLowerCase() === q
        )
      : [...tokens].sort((a, b) => score(a) - score(b));
    return list.slice(0, 60);
  }, [tokens, search]);

  if (!open) return null;

  const toAmount = quote
    ? Number(formatUnits(BigInt(quote.estimate.toAmount), quote.action.toToken.decimals))
    : 0;
  const amt = Number(amount) || 0;
  const overBalance = amt > walletUsdc + 1e-9;
  const busy = status.state === "approving" || status.state === "swapping";
  const canSwap = !!quote && !overBalance && !busy && amt > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="card relative w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Swap</h2>
          <button onClick={close} className="text-ink-soft text-sm hover:text-ink">
            Close
          </button>
        </div>

        {/* From */}
        <div className="rounded-2xl border border-line bg-ground p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft">You pay</span>
            <button
              onClick={() => setAmount(walletUsdc > 0 ? String(walletUsdc) : "")}
              className="text-ink-soft tabular-nums transition-colors hover:text-accent"
            >
              ${fmt(walletUsdc)} <span className="text-accent font-medium">MAX</span>
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-2xl tabular-nums text-ink placeholder:text-ink-soft/40 focus:outline-none"
            />
            <span className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium">
              <span className="bg-accent/20 text-accent flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold">
                $
              </span>
              USDC
            </span>
          </div>
        </div>

        {/* arrow */}
        <div className="relative z-10 -my-2 flex justify-center">
          <div className="border-line bg-surface text-ink-soft flex h-8 w-8 items-center justify-center rounded-full border">
            ↓
          </div>
        </div>

        {/* To */}
        <div className="rounded-2xl border border-line bg-ground p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft">You receive</span>
            {quote?.estimate.toAmountUSD ? (
              <span className="text-ink-soft tabular-nums">
                ≈ ${fmt(Number(quote.estimate.toAmountUSD))}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-2xl tabular-nums text-ink">
              {status.state === "quoting" ? (
                <span className="text-ink-soft text-base">Finding best route…</span>
              ) : toAmount > 0 ? (
                fmt(toAmount, toAmount < 1 ? 6 : 4)
              ) : (
                <span className="text-ink-soft/40">0.00</span>
              )}
            </span>
            <button
              onClick={() => setPickerOpen(true)}
              className="border-line bg-surface flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:border-ink-soft/40"
            >              {toToken?.logoURI ? (
                <img src={toToken.logoURI} alt="" className="h-5 w-5 rounded-full" />
              ) : (
                <span className="bg-line h-5 w-5 rounded-full" />
              )}
              {toToken?.symbol ?? "Select"}
              <span className="text-ink-soft text-xs">▾</span>
            </button>
          </div>
        </div>

        {/* status / error */}
        {status.state === "error" && (
          <p className="mt-3 text-sm text-red-400">{status.message}</p>
        )}
        {status.state === "done" && (
          <p className="mt-3 text-sm text-accent">
            Swap submitted ·{" "}
            <a
              href={`https://basescan.org/tx/${status.hash}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              View
            </a>
          </p>
        )}
        {overBalance && (
          <p className="mt-3 text-sm text-red-400">Exceeds your USDC balance.</p>
        )}

        <button
          onClick={doSwap}
          disabled={!canSwap}
          className="bg-ink text-ground mt-4 w-full rounded-xl px-4 py-3.5 font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {status.state === "approving"
            ? "Approving USDC…"
            : status.state === "swapping"
              ? "Swapping…"
              : status.state === "quoting"
                ? "Getting quote…"
                : overBalance
                  ? "Insufficient balance"
                  : !quote && amt > 0
                    ? "No route"
                    : "Swap"}
        </button>

        <p className="text-ink-soft mt-3 text-center text-[11px]">
          Routed by LI.FI · approve + swap from your wallet on Base
        </p>

        {/* Token picker */}
        {pickerOpen && (
          <div
            className="absolute inset-0 z-20 flex flex-col rounded-[inherit] bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium">Select token</h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-ink-soft text-sm hover:text-ink"
              >
                Close
              </button>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or paste address"
              autoFocus
              className="mb-3 rounded-xl border border-line bg-ground px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft/50 focus:outline-none"
            />
            <div className="-mx-1 flex-1 overflow-y-auto">
              {filtered.map((t) => (
                <button
                  key={t.address}
                  onClick={() => {
                    setToToken(t);
                    setPickerOpen(false);
                    setSearch("");
                  }}
                  className="hover:bg-ground flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                >                  {t.logoURI ? (
                    <img src={t.logoURI} alt="" className="h-7 w-7 rounded-full" />
                  ) : (
                    <span className="bg-line h-7 w-7 rounded-full" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.symbol}</span>
                    <span className="text-ink-soft block truncate text-xs">{t.name}</span>
                  </span>
                  {t.priceUSD ? (
                    <span className="text-ink-soft text-xs tabular-nums">
                      ${fmt(Number(t.priceUSD), Number(t.priceUSD) < 1 ? 4 : 2)}
                    </span>
                  ) : null}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-ink-soft py-6 text-center text-sm">No tokens found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
