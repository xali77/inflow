"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePrivy,
  useFundWallet,
  useSessionSigners,
} from "@privy-io/react-auth";
import Sheet from "./sheet";

const PRIVY_SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;

type Vault = { name: string; provider: string; user_apy: number | null };
type Position = { assets_in_vault: string; total_deposited: string };
type GrowData =
  | { configured: false }
  | { configured: true; vault: Vault; position: Position };

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

// Normalize Privy's user_apy to a percent. It can arrive as basis points
// (500 = 5%), a plain percent (5 = 5%), or a fraction (0.05 = 5%).
function apyToPercent(apy: number | null): number {
  if (!apy || apy <= 0) return 0;
  let pct = apy;
  if (apy >= 100) pct = apy / 100; // basis points
  else if (apy <= 1) pct = apy * 100; // fraction
  return Math.min(pct, 100); // sanity cap
}

export default function GrowCard({ address }: { address?: string }) {
  const { getAccessToken } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { addSessionSigners } = useSessionSigners();

  const [data, setData] = useState<GrowData | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw" | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Projected balance ticker (real yield is ~0 over a demo, so we show the
  // vault APY applied continuously from the moment the position loads).
  const [projected, setProjected] = useState<number | null>(null);
  const baseRef = useRef<{ principal: number; rate: number; at: number } | null>(
    null
  );

  const fetchGrow = useCallback(async (): Promise<GrowData | null> => {
    if (!address) return null;
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/grow/position", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return (await res.json()) as GrowData;
    } catch {
      return null;
    }
  }, [address, getAccessToken]);

  // Applies fetched data to state. Called from async callbacks (effect/submit),
  // never synchronously inside an effect body.
  const apply = useCallback((d: GrowData | null) => {
    if (!d) return;
    setData(d);
    if (d.configured) {
      const principal = Number(d.position.assets_in_vault) || 0;
      baseRef.current = {
        principal,
        rate: apyToPercent(d.vault.user_apy) / 100,
        at: Date.now(),
      };
      setProjected(principal);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchGrow().then((d) => {
      if (!cancelled) apply(d);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchGrow, apply]);

  // Tick the projected number every second.
  useEffect(() => {
    if (!data?.configured) return;
    const t = setInterval(() => {
      const b = baseRef.current;
      if (!b) return;
      const elapsed = (Date.now() - b.at) / 1000;
      setProjected(b.principal * (1 + (b.rate * elapsed) / SECONDS_PER_YEAR));
    }, 1000);
    return () => clearInterval(t);
  }, [data]);

  const submit = useCallback(async () => {
    if (!mode || !amount || Number(amount) <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/grow/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Request failed");
      }
      setMode(null);
      setAmount("");
      apply(await fetchGrow());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }, [mode, amount, getAccessToken, fetchGrow, apply]);

  // Grant the app's server signer session access to this TEE embedded wallet,
  // so the backend can execute Grow deposits/withdrawals on the user's behalf.
  const enableGrow = useCallback(async () => {
    if (!address) return;
    setError(null);
    if (!PRIVY_SIGNER_ID) {
      setError("Set NEXT_PUBLIC_PRIVY_SIGNER_ID to enable Grow.");
      return;
    }
    try {
      await addSessionSigners({
        address,
        signers: [{ signerId: PRIVY_SIGNER_ID }],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable Grow");
    }
  }, [address, addSessionSigners]);

  // Hidden until the position check resolves.
  if (!data) return null;

  if (!data.configured) {
    return (
      <div className="card p-5">
        <p className="eyebrow">Grow</p>
        <p className="text-ink-soft mt-2 text-xs">
          Earn yield on your balance. Set NEXT_PUBLIC_GROW_VAULT_ID to enable.
        </p>
      </div>
    );
  }

  const apyPct = apyToPercent(data.vault.user_apy).toFixed(2);
  const principal = Number(data.position.assets_in_vault) || 0;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">Grow</span>
        <span className="text-accent border-accent/30 bg-accent/5 rounded-full border px-2 py-0.5 text-xs font-medium">
          {apyPct}% APY
        </span>
      </div>

      <p className="text-3xl font-semibold tabular-nums">
        <span className="text-ink-soft">$</span>
        {(projected ?? principal).toFixed(principal > 0 ? 4 : 2)}
      </p>
      <p className="text-ink-soft mt-1 text-xs">projected at {apyPct}% APY</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            setError(null);
            setMode("deposit");
          }}
          className="rounded-xl border border-line bg-ground py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink-soft/40"
        >
          Add to Grow
        </button>
        <button
          onClick={() => {
            setError(null);
            setMode("withdraw");
          }}
          className="rounded-xl border border-line bg-ground py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink-soft/40"
        >
          Withdraw
        </button>
      </div>

      <div className="text-ink-soft mt-4 flex items-center justify-between text-xs">
        <button
          onClick={() => address && fundWallet({ address })}
          className="transition-colors hover:text-ink"
        >
          Add funds
        </button>
        <button onClick={enableGrow} className="transition-colors hover:text-ink">
          Enable Grow
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <Sheet
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === "withdraw" ? "Withdraw from Grow" : "Add to Grow"}
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-soft text-sm">Amount (USDC)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              className="rounded-xl border border-line bg-ground px-4 py-3 tabular-nums text-ink placeholder:text-ink-soft/60 focus:outline-none"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            onClick={submit}
            disabled={busy || !amount || Number(amount) <= 0}
            className="rounded-xl border border-line bg-surface px-4 py-3 text-ink disabled:opacity-50"
          >
            {busy
              ? "Working…"
              : mode === "withdraw"
                ? "Withdraw"
                : "Add to Grow"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
