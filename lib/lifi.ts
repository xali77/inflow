// Headless LI.FI integration: fetch token lists + quotes from the public API,
// then execute the returned transactionRequest as a normal approve + swap from
// the Privy embedded wallet. No widget, no EIP-2612/Permit2 permit signatures
// (which the embedded wallet can't pass on-chain) — just standard ERC-20
// approve + a plain swap transaction the wallet signs and broadcasts.
const LIFI = "https://li.quest/v1";

export const BASE_CHAIN = 8453;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export type LifiToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
  priceUSD?: string;
};

export type LifiQuote = {
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress: string;
    fromAmountUSD?: string;
    toAmountUSD?: string;
  };
  action: { fromToken: LifiToken; toToken: LifiToken };
  transactionRequest: {
    to: string;
    data: string;
    value?: string;
    chainId: number;
    gasLimit?: string;
    gasPrice?: string;
  };
};

/** Token list for a chain (sorted by LI.FI; large — filter client-side). */
export async function getTokens(chainId = BASE_CHAIN): Promise<LifiToken[]> {
  const res = await fetch(`${LIFI}/tokens?chains=${chainId}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { tokens?: Record<string, LifiToken[]> };
  return data.tokens?.[chainId] ?? [];
}

/** A single-chain swap quote with a ready-to-send transactionRequest. */
export async function getQuote(params: {
  fromToken: string;
  toToken: string;
  fromAmount: string; // base units
  fromAddress: string;
  fromChain?: number;
  toChain?: number;
  slippage?: number;
}): Promise<LifiQuote> {
  const q = new URLSearchParams({
    fromChain: String(params.fromChain ?? BASE_CHAIN),
    toChain: String(params.toChain ?? BASE_CHAIN),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    slippage: String(params.slippage ?? 0.005),
  });
  const res = await fetch(`${LIFI}/quote?${q.toString()}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? "No route found for this pair.");
  }
  return res.json();
}
