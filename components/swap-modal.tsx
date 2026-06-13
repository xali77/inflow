"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePrivy } from "@privy-io/react-auth";
import type { WidgetConfig } from "@lifi/widget";
import { EthereumProvider } from "@lifi/widget-provider-ethereum";

// LI.FI widget is client-only and heavy — load it lazily, never during SSR.
const LiFiWidget = dynamic(
  () => import("@lifi/widget").then((m) => m.LiFiWidget),
  { ssr: false }
);

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH_BASE = "0x4200000000000000000000000000000000000006";

// Any token is searchable (no allow list). Featured tokens give the CEX feel;
// chains are limited to a few cheap EVM chains to reduce wallet errors.
//
// Standard approve + swap from the active wagmi wallet (the Privy embedded
// wallet). Relayer/permit routes are OFF — they rely on EIP-2612/Permit2
// signatures the embedded wallet doesn't pass on-chain ("EIP2612: invalid
// signature"). A normal approve + swap uses the wallet's own gas instead.
const config: WidgetConfig = {
  integrator: "flows-space",
  providers: [EthereumProvider()],
  appearance: "dark",
  variant: "compact",
  fromChain: 8453, // Base
  fromToken: USDC_BASE,
  slippage: 0.005,
  useRelayerRoutes: false,
  chains: {
    allow: [8453, 42161, 10, 137], // Base, Arbitrum, Optimism, Polygon
  },
  tokens: {
    featured: [
      { chainId: 8453, address: USDC_BASE, symbol: "USDC", decimals: 6, name: "USD Coin" },
      { chainId: 8453, address: WETH_BASE, symbol: "WETH", decimals: 18, name: "Wrapped Ether" },
    ],
  },
  // Strip the DeFi clutter for a clean, CEX-like feel.
  hiddenUI: {
    poweredBy: true,
    language: true,
    bridgesSettings: true,
    integratorStepDetails: true,
    routeCardPriceImpact: true,
    routeTokenDescription: true,
    gasRefuelMessage: true,
  },
  // Match the Flows warm-dark palette (LI.FI v4 uses MUI colorSchemes).
  theme: {
    colorSchemes: {
      dark: {
        palette: {
          primary: { main: "#E8A33D" },
          secondary: { main: "#9B9189" },
          background: { default: "#14110F", paper: "#1D1916" },
          text: { primary: "#F4EFE9", secondary: "#9B9189" },
        },
      },
    },
    shape: { borderRadius: 16 },
    container: { border: "1px solid #2A241F", borderRadius: "20px" },
  },
};

export default function SwapModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const logged = useRef<Set<string>>(new Set());

  // Log completed swaps to the event store (score-bearing trading behavior).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let unsub = () => {};
    import("@lifi/widget").then(({ widgetEvents, WidgetEvent }) => {
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = async (update: any) => {
        try {
          const route = update?.route ?? update;
          const steps = route?.steps ?? [];
          const done =
            steps.length > 0 &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            steps.every((s: any) => s?.execution?.status === "DONE");
          if (!done || !route?.id || logged.current.has(route.id)) return;
          logged.current.add(route.id);
          const token = await getAccessToken();
          await fetch("/api/events", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              type: "swap.executed",
              amount_usd: Number(route.fromAmountUSD ?? route.toAmountUSD ?? 0),
              payload: {
                fromToken: route.fromToken?.symbol,
                toToken: route.toToken?.symbol,
                fromChain: route.fromChainId,
                toChain: route.toChainId,
              },
            }),
          });
        } catch {
          /* best-effort */
        }
      };
      widgetEvents.on(WidgetEvent.RouteExecutionUpdated, handler);
      unsub = () => widgetEvents.off(WidgetEvent.RouteExecutionUpdated, handler);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [open, getAccessToken]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="text-ink-soft absolute -top-9 right-0 text-sm hover:text-ink"
        >
          Close
        </button>
        <div className="overflow-hidden rounded-2xl">
          <LiFiWidget integrator="flows-space" config={config} />
        </div>
      </div>
    </div>
  );
}
