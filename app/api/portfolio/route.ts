import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  type Address,
} from "viem";
import { base } from "viem/chains";

// Wallet utility only — NOT FlowScore-bearing. A curated set of Base tokens
// shown with live balances + USD (prices from LI.FI). The Swap widget handles
// discovery of any other token.
const NATIVE = "0x0000000000000000000000000000000000000000";
const TOKENS: { symbol: string; address: Address; decimals: number; native?: boolean }[] = [
  { symbol: "ETH", address: NATIVE as Address, decimals: 18, native: true },
  { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
  { symbol: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18 },
];

const client = createPublicClient({ chain: base, transport: http() });

async function priceUSD(address: string): Promise<number> {
  try {
    const r = await fetch(
      `https://li.quest/v1/token?chain=8453&token=${address}`,
      { cache: "no-store" }
    );
    if (!r.ok) return 0;
    const d = await r.json();
    return Number(d?.priceUSD ?? 0);
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }

  try {
    const erc20s = TOKENS.filter((t) => !t.native);
    const [native, erc20Balances, prices] = await Promise.all([
      client.getBalance({ address }),
      client.multicall({
        contracts: erc20s.map((t) => ({
          address: t.address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address],
        })),
      }),
      Promise.all(TOKENS.map((t) => priceUSD(t.address))),
    ]);

    const rawByToken = new Map<string, bigint>();
    rawByToken.set("ETH", native);
    erc20s.forEach((t, i) => {
      const r = erc20Balances[i];
      rawByToken.set(
        t.symbol,
        r.status === "success" ? (r.result as bigint) : BigInt(0)
      );
    });

    const holdings = TOKENS.map((t, i) => {
      const raw = rawByToken.get(t.symbol) ?? BigInt(0);
      const amount = Number(formatUnits(raw, t.decimals));
      const usd = amount * prices[i];
      return { symbol: t.symbol, amount, usd };
    })
      .filter((h) => h.amount > 0)
      .sort((a, b) => b.usd - a.usd);

    const total = holdings.reduce((s, h) => s + h.usd, 0);
    return NextResponse.json({ holdings, total });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load portfolio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
