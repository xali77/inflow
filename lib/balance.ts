import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  type Address,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { defaultChain } from "./chains";
import { getUsdcAddress } from "./usdc";
import { USDC_DECIMALS } from "./usdc";
import { SEPOLIA_USDC } from "./flowpool";

const client = createPublicClient({ chain: defaultChain, transport: http() });
const baseClient = createPublicClient({ chain: base, transport: http() });
const sepoliaClient = createPublicClient({ chain: baseSepolia, transport: http() });
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

type BalanceClient = {
  readContract(args: {
    address: Address;
    abi: typeof erc20Abi;
    functionName: "balanceOf";
    args: [Address];
  }): Promise<bigint>;
};

async function readErc20Balance(
  publicClient: BalanceClient,
  token: Address,
  address: Address,
  decimals: number
) {
  const raw = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  return Number(formatUnits(raw, decimals)).toFixed(2);
}

/** USDC balance on the default chain, formatted to 2 decimals. "0.00" on any failure. */
export async function getUsdcBalance(address: Address): Promise<string> {
  try {
    const usdc = getUsdcAddress();
    if (usdc) {
      return readErc20Balance(client, usdc, address, USDC_DECIMALS);
    }
    const raw = await client.getBalance({ address });
    return Number(
      formatUnits(raw, defaultChain.nativeCurrency.decimals)
    ).toFixed(2);
  } catch {
    return "0.00";
  }
}

/** Base mainnet USDC balance, formatted to 2 decimals. Throws instead of masking RPC failures. */
export async function getBaseUsdcBalance(address: Address): Promise<string> {
  try {
    return await readErc20Balance(
      baseClient,
      BASE_USDC,
      address,
      USDC_DECIMALS
    );
  } catch {
    return readErc20Balance(client, BASE_USDC, address, USDC_DECIMALS);
  }
}

/** Testnet USDC balance on Base Sepolia (for lending tests), formatted to 2 decimals. */
export async function getSepoliaUsdcBalance(address: Address): Promise<string> {
  try {
    const raw = await sepoliaClient.readContract({
      address: SEPOLIA_USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    return Number(formatUnits(raw, 6)).toFixed(2);
  } catch {
    return "0.00";
  }
}
