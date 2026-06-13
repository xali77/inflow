"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";
import { countryFlag, countryName } from "@/lib/countries";
import Sheet from "./sheet";

type LineView = {
  id: string;
  counterparty: string;
  counterpartyName?: string;
  counterpartyCountry?: string;
  role: "sender" | "receiver";
  lineScore: number;
  health: "healthy" | "watch" | "at-risk" | "new";
  count: number;
  total: number;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const healthColor = (h: LineView["health"]) =>
  h === "healthy" ? "#E8A33D" : h === "watch" ? "#c79a5e" : "#9B9189";
const healthLabel = (h: LineView["health"]) =>
  h === "new" ? "Building" : h.charAt(0).toUpperCase() + h.slice(1);

export default function FlowLinesModal({
  open,
  onClose,
  address,
}: {
  open: boolean;
  onClose: () => void;
  address?: string;
}) {
  const [lines, setLines] = useState<LineView[]>([]);
  const [starting, setStarting] = useState(false);
  const [cp, setCp] = useState("");
  const [lookup, setLookup] = useState<{ name?: string; country?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    const res = await fetch(`/api/flowlines?address=${address}`);
    const d = await res.json();
    setLines(d.lines ?? []);
  }, [address]);

  useEffect(() => {
    // load() only setStates after an await (async), so this is safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) load();
  }, [open, load]);

  // Look up the counterparty's profile as a valid address is entered.
  useEffect(() => {
    if (!isAddress(cp)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLookup(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/profile?address=${cp}`)
        .then((r) => r.json())
        .then((d) => !cancelled && setLookup(d.profile ? { name: d.profile.name, country: d.profile.country } : {}))
        .catch(() => !cancelled && setLookup({}));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cp]);

  const start = useCallback(async () => {
    if (!address || !isAddress(cp)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/flowlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: address, counterparty: cp }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Could not start a line");
      }
      setCp("");
      setLookup(null);
      setStarting(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a line");
    } finally {
      setBusy(false);
    }
  }, [address, cp, load]);

  return (
    <Sheet open={open} onClose={onClose} title="FlowLines">
      <p className="text-ink-soft mb-4 text-xs">
        A FlowLine is a remittance relationship with someone. Its LineScore (1–100)
        grows as money flows consistently — and powers undercollateralized borrowing.
      </p>

      {!starting ? (
        <button
          onClick={() => setStarting(true)}
          className="bg-ink text-ground mb-4 w-full rounded-xl py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
        >
          + Start a FlowLine
        </button>
      ) : (
        <div className="border-line bg-ground mb-4 flex flex-col gap-3 rounded-xl border p-4">
          <input
            value={cp}
            onChange={(e) => setCp(e.target.value.trim())}
            placeholder="Counterparty address 0x…"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:outline-none"
          />
          {isAddress(cp) && lookup?.name && (
            <p className="text-ink-soft text-xs">
              {lookup.name}
              {lookup.country ? ` · ${countryFlag(lookup.country)} ${countryName(lookup.country)}` : ""}
            </p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={start}
              disabled={!isAddress(cp) || busy}
              className="bg-ink text-ground flex-1 rounded-lg py-2 text-xs font-medium disabled:opacity-50"
            >
              {busy ? "Starting…" : "Start line"}
            </button>
            <button
              onClick={() => {
                setStarting(false);
                setError(null);
              }}
              className="text-ink-soft flex-1 rounded-lg border border-line py-2 text-xs hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="text-ink-soft py-4 text-center text-sm">No FlowLines yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lines.map((l) => (
            <div key={l.id} className="border-line bg-ground rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {l.counterpartyName ?? short(l.counterparty)}
                    {l.counterpartyCountry ? (
                      <span className="text-ink-soft"> · {countryFlag(l.counterpartyCountry)}</span>
                    ) : null}
                  </p>
                  <p className="text-ink-soft text-xs">
                    {l.role === "sender" ? "You pay them" : "They pay you"}
                    {l.count > 0 ? ` · ${l.count} payments · $${l.total.toFixed(0)}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold tabular-nums" style={{ color: healthColor(l.health) }}>
                    {l.lineScore}
                  </p>
                  <p className="text-ink-soft text-[10px] uppercase tracking-wide">LineScore</p>
                </div>
              </div>
              <div className="bg-line mt-3 h-1.5 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${l.lineScore}%`, background: healthColor(l.health) }}
                />
              </div>
              <p className="mt-1.5 text-xs" style={{ color: healthColor(l.health) }}>
                {healthLabel(l.health)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
