import { defineChain, type Chain } from "viem";
import { base } from "viem/chains";

const arcRpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL;
const arcChainId = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID);

// Arc uses USDC as its native gas token. The native form has 18 decimals
// (the USDC ERC-20 interface at 0x3600…0000 exposes the same balance at 6).
export const arcTestnet: Chain | null =
  arcRpcUrl && arcChainId
    ? defineChain({
        id: arcChainId,
        name: "Arc testnet",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        rpcUrls: { default: { http: [arcRpcUrl] } },
        blockExplorers: {
          default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
        },
        testnet: true,
      })
    : null;

if (!arcTestnet && typeof window !== "undefined") {
  console.warn(
    "Arc testnet env vars (NEXT_PUBLIC_ARC_RPC_URL / NEXT_PUBLIC_ARC_CHAIN_ID) are not set; booting on Base only."
  );
}

export const supportedChains: [Chain, ...Chain[]] = arcTestnet
  ? [arcTestnet, base]
  : [base];

export const defaultChain: Chain = arcTestnet ?? base;
