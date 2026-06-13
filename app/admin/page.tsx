"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScoringConfig } from "@/lib/scoring";

type StoredEvent = {
  type: string;
  address?: string;
  amount_usd?: number;
  created_at: string;
  payload?: Record<string, unknown>;
};
type Stats = {
  total: number;
  users: number;
  volumeUsd: number;
  byType: Record<string, number>;
  volumeByType: Record<string, number>;
};
type AdminData = { stats: Stats; events: StoredEvent[]; config: ScoringConfig };

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

const FLOW_SCORE_KEYS: (keyof ScoringConfig["flowScore"])[] = [
  "flowlines",
  "liquidity",
  "repayment",
  "integrity",
  "trading",
];
const FLOW_LINE_KEYS: (keyof ScoringConfig["flowLine"])[] = [
  "consistency",
  "longevity",
  "volume",
  "growth",
];

export default function Admin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin");
    return (await res.json()) as AdminData;
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().then((d) => {
      if (cancelled) return;
      setData(d);
      setConfig(d.config);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const saveConfig = useCallback(async () => {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/admin/scoring", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [config]);

  if (!data || !config) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-ink-soft text-sm">Loading admin…</p>
      </main>
    );
  }

  const { stats, events } = data;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Flows · Admin</h1>
      <p className="text-ink-soft mb-6 text-sm">
        Behavior analytics and FlowScore tuning. Internal — ungated.
      </p>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: "Events tracked", value: stats.total.toLocaleString() },
          { label: "Active users", value: stats.users.toLocaleString() },
          { label: "Total volume", value: `$${money(stats.volumeUsd)}` },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <p className="eyebrow">{s.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Scoring weights editor */}
        <div className="card p-5">
          <p className="mb-1 text-sm font-medium">Scoring weights</p>
          <p className="text-ink-soft mb-4 text-xs">
            Tune how each behavior affects scores. Saved to config (live engine
            reads these).
          </p>

          <p className="eyebrow mb-2">FlowScore</p>
          <div className="mb-5 flex flex-col gap-2">
            {FLOW_SCORE_KEYS.map((k) => (
              <label key={k} className="flex items-center justify-between gap-3">
                <span className="text-sm capitalize">{k}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.flowScore[k]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      flowScore: { ...config.flowScore, [k]: Number(e.target.value) },
                    })
                  }
                  className="w-20 rounded-lg border border-line bg-ground px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none"
                />
              </label>
            ))}
          </div>

          <p className="eyebrow mb-2">FlowLine</p>
          <div className="flex flex-col gap-2">
            {FLOW_LINE_KEYS.map((k) => (
              <label key={k} className="flex items-center justify-between gap-3">
                <span className="text-sm capitalize">{k}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.flowLine[k]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      flowLine: { ...config.flowLine, [k]: Number(e.target.value) },
                    })
                  }
                  className="w-20 rounded-lg border border-line bg-ground px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none"
                />
              </label>
            ))}
          </div>

          <button
            onClick={saveConfig}
            disabled={saving}
            className="bg-ink text-ground mt-5 w-full rounded-xl py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save weights"}
          </button>
        </div>

        {/* Events by type + feed */}
        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <p className="mb-3 text-sm font-medium">Events by type</p>
            {Object.keys(stats.byType).length === 0 ? (
              <p className="text-ink-soft text-sm">No events yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {Object.entries(stats.byType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <span className="text-ink-soft">{type}</span>
                      <span className="tabular-nums">
                        {count}
                        {stats.volumeByType[type]
                          ? `  ·  $${money(stats.volumeByType[type])}`
                          : ""}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <p className="mb-3 text-sm font-medium">Recent activity</p>
            {events.length === 0 ? (
              <p className="text-ink-soft text-sm">No events yet.</p>
            ) : (
              <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                {events.map((e, i) => (
                  <div
                    key={`${e.created_at}-${i}`}
                    className="flex items-center justify-between gap-3 border-b border-line pb-2 text-xs last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{e.type}</p>
                      <p className="text-ink-soft truncate">
                        {short(e.address)} · {ago(e.created_at)}
                      </p>
                    </div>
                    {e.amount_usd ? (
                      <span className="shrink-0 tabular-nums">${money(Number(e.amount_usd))}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
