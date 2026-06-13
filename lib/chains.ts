import { defineChain, type Chain } from "viem";
import { base, arbitrum, optimism, polygon } from "viem/chains";

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

// Base mainnet is the primary chain — it's where Privy Earn (Morpho USDC
// vaults) lives. The other EVM chains are enabled so the LI.FI swap widget can
// route from the embedded wallet across them. Arc testnet stays optional.
const evmChains: Chain[] = [base, arbitrum, optimism, polygon];
export const supportedChains: [Chain, ...Chain[]] = arcTestnet
  ? [base, arbitrum, optimism, polygon, arcTestnet]
  : (evmChains as [Chain, ...Chain[]]);

export const defaultChain: Chain = base;
