"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { getUsdcBalance } from "@/lib/balance";

export default function Balance({
  address,
  reloadSignal,
}: {
  address?: string;
  reloadSignal?: number;
}) {
  const [balance, setBalance] = useState("0.00");

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    getUsdcBalance(address as Address).then((b) => {
      if (!cancelled) setBalance(b);
    });
    return () => {
      cancelled = true;
    };
  }, [address, reloadSignal]);

  const [whole, cents] = Number(balance)
    .toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .split(".");

  return (
    <div>
      <p className="eyebrow">Available balance</p>
      <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">
        <span className="text-ink-soft">$</span>
        {whole}
        <span className="text-ink-soft">.{cents}</span>
      </p>
    </div>
  );
}
