"use client";

import { useCallback, useEffect, useState } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { defaultChain } from "@/lib/chains";
import { getUsdcAddress, USDC_DECIMALS } from "@/lib/usdc";
import type { Schedule } from "@/lib/schedules";
import Sheet from "./sheet";

// Inlined here (rather than imported from lib/schedules) so this client
// component doesn't pull the Node-only store module into the browser bundle.
const DAY = 86_400_000;
function computeNextRun(from: Date, c: Schedule["cadence"], custom?: number): string {
  const days =
    c === "weekly" ? 7 : c === "monthly" ? 30 : c === "custom" ? Math.max(1, custom ?? 30) : 0;
  return new Date(from.getTime() + days * DAY).toISOString();
}

const cadenceLabel = (s: Schedule) =>
  s.cadence === "once"
    ? "One-time"
    : s.cadence === "weekly"
      ? "Every 7 days"
      : s.cadence === "monthly"
        ? "Every 30 days"
        : `Every ${s.intervalDays ?? 30} days`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function ScheduledModal({
  open,
  onClose,
  address,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  address?: string;
  onChange?: () => void;
}) {
  const { sendTransaction } = useSendTransaction();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    if (!address) return;
    const res = await fetch(`/api/schedules?address=${address}`);
    const d = await res.json();
    setSchedules(d.schedules ?? []);
  }, [address]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    load();
  }, [open, load]);

  const patch = useCallback(
    async (id: string, body: Partial<Schedule>) => {
      await fetch("/api/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      await load();
      onChange?.();
    },
    [load, onChange]
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/schedules?id=${id}`, { method: "DELETE" });
      await load();
      onChange?.();
    },
    [load, onChange]
  );

  // Execute a due payment from the user's wallet, then advance the schedule.
  const runNow = useCallback(
    async (s: Schedule) => {
      const usdc = getUsdcAddress();
      if (!usdc || !address) return;
      setBusy(s.id);
      setError(null);
      try {
        const { hash } = await sendTransaction({
          to: usdc,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [s.to as `0x${string}`, parseUnits(String(s.amount), USDC_DECIMALS)],
          }),
          chainId: defaultChain.id,
        });
        fetch("/api/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: address, to: s.to, amount: s.amount.toFixed(2), hash }),
        }).catch(() => {});

        // Advance: one-time deactivates; recurring rolls to the next interval.
        const now = new Date();
        await patch(s.id, {
          runs: s.runs + 1,
          last_run: now.toISOString(),
          active: s.cadence !== "once",
          next_run:
            s.cadence === "once"
              ? s.next_run
              : computeNextRun(now, s.cadence, s.intervalDays),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Payment failed");
      } finally {
        setBusy(null);
      }
    },
    [address, sendTransaction, patch]
  );

  const startEdit = (s: Schedule) => {
    setEditId(s.id);
    setDraftAmount(String(s.amount));
    setDraftDate(s.next_run.slice(0, 10));
    setError(null);
  };

  const saveEdit = async (id: string) => {
    setBusy(id);
    try {
      await patch(id, {
        amount: Number(draftAmount) || undefined,
        next_run: new Date(`${draftDate}T12:00:00`).toISOString(),
      });
      setEditId(null);
    } finally {
      setBusy(null);
    }
  };

  const isDue = (s: Schedule) => s.active && new Date(s.next_run).getTime() <= now;

  return (
    <Sheet open={open} onClose={onClose} title="Scheduled payments">
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {schedules.length === 0 ? (
        <p className="text-ink-soft py-6 text-center text-sm">
          No scheduled payments yet. Tap Send → Schedule to set one up.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {schedules.map((s) => (
            <div
              key={s.id}
              className={`rounded-xl border p-4 ${
                isDue(s) ? "border-accent/40 bg-accent/5" : "border-line bg-ground"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {s.toName ?? short(s.to)}
                  </p>
                  <p className="text-ink-soft text-xs">
                    {cadenceLabel(s)}
                    {!s.active ? " · paused" : ""}
                    {s.runs > 0 ? ` · ${s.runs} sent` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-base font-semibold tabular-nums">
                  ${s.amount.toFixed(2)}
                </p>
              </div>

              {editId === s.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={draftAmount}
                      onChange={(e) => setDraftAmount(e.target.value)}
                      type="number"
                      className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm tabular-nums focus:outline-none"
                      placeholder="Amount"
                    />
                    <input
                      value={draftDate}
                      onChange={(e) => setDraftDate(e.target.value)}
                      type="date"
                      className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm tabular-nums focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(s.id)}
                      disabled={busy === s.id}
                      className="bg-ink text-ground flex-1 rounded-lg py-2 text-xs font-medium disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="text-ink-soft flex-1 rounded-lg border border-line py-2 text-xs hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-ink-soft mt-2 text-xs">
                    {isDue(s) ? (
                      <span className="text-accent font-medium">Due now</span>
                    ) : (
                      <>Next: {fmtDate(s.next_run)}</>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isDue(s) && (
                      <button
                        onClick={() => runNow(s)}
                        disabled={busy === s.id}
                        className="bg-ink text-ground rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      >
                        {busy === s.id ? "Sending…" : "Send now"}
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(s)}
                      className="text-ink-soft rounded-lg border border-line px-3 py-1.5 text-xs hover:text-ink"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => patch(s.id, { active: !s.active })}
                      className="text-ink-soft rounded-lg border border-line px-3 py-1.5 text-xs hover:text-ink"
                    >
                      {s.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => remove(s.id)}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-red-400 hover:border-red-400/40"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
