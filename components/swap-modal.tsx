"use client";

import dynamic from "next/dynamic";
import type { WidgetConfig } from "@lifi/widget";

// LI.FI widget is client-only and heavy — load it lazily, never during SSR.
const LiFiWidget = dynamic(
  () => import("@lifi/widget").then((m) => m.LiFiWidget),
  { ssr: false }
);

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH_BASE = "0x4200000000000000000000000000000000000006";

// Any token is searchable (no token allow list). Featured tokens give the CEX
// feel; chains are limited to a few cheap EVM chains to reduce wallet errors.
const config: WidgetConfig = {
  integrator: "flows-space",
  appearance: "dark",
  variant: "compact",
  fromChain: 8453, // Base
  fromToken: USDC_BASE,
  slippage: 0.005,
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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
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
