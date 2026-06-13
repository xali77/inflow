"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

// Opens the Transak buy/sell flow funded by the user's embedded wallet.
export function useRamp(onDone?: () => void) {
  const { getAccessToken } = usePrivy();
  const [busy, setBusy] = useState<"BUY" | "SELL" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    async (product: "BUY" | "SELL") => {
      setBusy(product);
      setError(null);
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/transak/widget-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ product }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "Could not start");
        }
        const { widgetUrl } = await res.json();
        const { Transak } = await import("@transak/transak-sdk");
        document.getElementById("transakRoot")?.remove();
        const transak = new Transak({
          widgetUrl,
          referrer: window.location.origin,
          themeColor: "E8A33D",
        });
        transak.init();
        Transak.on(Transak.EVENTS.TRANSAK_ORDER_SUCCESSFUL, () => onDone?.());
        Transak.on(Transak.EVENTS.TRANSAK_WIDGET_CLOSE, () => transak.close());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start");
      } finally {
        setBusy(null);
      }
    },
    [getAccessToken, onDone]
  );

  return { open, busy, error };
}
