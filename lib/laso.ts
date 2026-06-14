import {
  parseUnits,
  toHex,
  verifyTypedData,
  type Address,
} from "viem";
import type { LocalAccount } from "viem/accounts";
import { createViemAccount } from "@privy-io/server-auth/viem";
import {
  wrapFetchWithPayment,
  x402Client,
  type PaymentRequirements,
} from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import { wrapFetchWithSIWx } from "@x402/extensions/sign-in-with-x";
import { getPrivy } from "./privy";

// Laso Finance: x402-paywalled card issuing. Payments are made from each user's
// own Privy embedded wallet — the backend never holds a funded key. We wrap the
// user's Privy wallet as a viem account whose signing is delegated to Privy's
// Wallet API (authorized by PRIVY_AUTHORIZATION_PRIVATE_KEY once the user has
// delegated their wallet to the app), then let x402/SIWx sign through it.
const BASE_URL = process.env.LASO_BASE_URL ?? "https://laso.finance";

// x402 won't authorize more than this per call (covers $1000 + fees). USDC 6dp.
const MAX_PAYMENT = parseUnits("1100", 6);

export const INTL_CARD_TYPE = "Non-Reloadable International";
export const US_CARD_TYPE = "Non-Reloadable U.S.";

export type UserWallet = { id: string; address: string };

export function isLasoConfigured() {
  // Payment comes from the user's Privy wallet, so config = a Privy server
  // client able to authorize delegated signing.
  return (
    !!process.env.PRIVY_APP_SECRET &&
    !!process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY
  );
}

// A viem account backed by the user's Privy embedded wallet. Signing is
// performed server-side by Privy's Wallet API using the app's authorization key.
async function privyAccount(wallet: UserWallet) {
  const privy = getPrivy();
  return createViemAccount({
    walletId: wallet.id,
    address: wallet.address as Address,
    privy: privy as unknown as Parameters<typeof createViemAccount>[0]["privy"],
  });
}

type Clients = {
  siwx: (input: string, init?: RequestInit) => Promise<Response>;
  pay: (input: string, init?: RequestInit) => Promise<Response>;
};
const _clientsByWallet = new Map<string, Promise<Clients>>();

function replaceBigInts<T>(value: T): T {
  if (typeof value === "bigint") return toHex(value) as T;
  if (Array.isArray(value)) return value.map(replaceBigInts) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, replaceBigInts(entry)])
  ) as T;
}

function amountFor(requirement: PaymentRequirements) {
  const legacy = requirement as PaymentRequirements & {
    maxAmountRequired?: string;
  };
  const amount = legacy.amount ?? legacy.maxAmountRequired;
  if (!amount) throw new Error("Laso payment challenge is missing amount");
  return BigInt(amount);
}

function selectBasePayment(
  _x402Version: number,
  requirements: PaymentRequirements[]
) {
  const accepted = requirements.filter((requirement) => {
    const network = String(requirement.network);
    const isBase =
      network === "eip155:8453" || network === "base";
    return (
      requirement.scheme === "exact" &&
      isBase &&
      amountFor(requirement) <= MAX_PAYMENT
    );
  });
  if (!accepted.length) {
    throw new Error("Laso payment challenge has no supported Base USDC option");
  }
  return accepted[0];
}

function privyEvmSigner(account: LocalAccount): ClientEvmSigner {
  return {
    address: account.address,
    async signTypedData(message) {
      const typedData = replaceBigInts(message);
      const signature = await account.signTypedData(
        typedData as Parameters<typeof account.signTypedData>[0]
      );
      const valid = await verifyTypedData({
        ...(typedData as Parameters<typeof verifyTypedData>[0]),
        address: account.address,
        signature,
      }).catch(() => false);
      if (!valid) {
        throw new Error(
          `Privy wallet ${account.address} produced an invalid x402 payment signature. Re-enable card payments for this wallet and confirm the Privy signer is delegated.`
        );
      }
      return signature;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function decodePaymentRequiredHeader(value: string | null) {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function paymentRequiredSummary(response: Response) {
  const challenge = decodePaymentRequiredHeader(
    response.headers.get("payment-required")
  );
  if (!isRecord(challenge) || !Array.isArray(challenge.accepts)) return null;
  const base = challenge.accepts.find((accept) => {
    if (!isRecord(accept)) return false;
    return accept.network === "eip155:8453" || accept.network === "base";
  });
  if (!isRecord(base)) return null;

  const rawAmount =
    typeof base.amount === "string"
      ? base.amount
      : typeof base.maxAmountRequired === "string"
        ? base.maxAmountRequired
        : null;
  const amount = rawAmount ? Number(rawAmount) / 1_000_000 : null;
  const displayAmount = Number.isFinite(amount) ? ` for ${amount} USDC` : "";
  return `${String(base.scheme)} ${String(base.network)}${displayAmount}`;
}

function paymentResponseSummary(response: Response) {
  const settlement = decodePaymentRequiredHeader(
    response.headers.get("payment-response") ??
      response.headers.get("x-payment-response")
  );
  if (!isRecord(settlement)) return null;

  const reason =
    typeof settlement.errorReason === "string"
      ? settlement.errorReason
      : typeof settlement.reason === "string"
        ? settlement.reason
        : null;
  const message =
    typeof settlement.errorMessage === "string"
      ? settlement.errorMessage
      : typeof settlement.message === "string"
        ? settlement.message
        : null;
  const tx =
    typeof settlement.transaction === "string"
      ? settlement.transaction
      : null;
  const success =
    typeof settlement.success === "boolean"
      ? `success=${settlement.success}`
      : null;

  return [success, reason, message, tx ? `tx=${tx}` : null]
    .filter(Boolean)
    .join(", ");
}

function lasoError(
  path: string,
  response: Response,
  body: string,
  wallet?: UserWallet
) {
  if (response.status !== 402) {
    return `Laso ${path} failed ${response.status}: ${body}`;
  }
  const summary = paymentRequiredSummary(response);
  const settlement = paymentResponseSummary(response);
  return [
    `Laso ${path} failed 402 after x402 payment retry`,
    summary ? ` (${summary})` : "",
    settlement ? `. Settlement: ${settlement}` : "",
    wallet ? ` from ${wallet.address}` : "",
    ". Confirm this Privy wallet has enough Base USDC and delegated signing is enabled.",
    body && body !== "{}" ? ` Response: ${body}` : "",
  ].join("");
}

async function buildClientsFor(wallet: UserWallet): Promise<Clients> {
  const account = await privyAccount(wallet);
  const client = new x402Client(selectBasePayment);
  registerExactEvmScheme(client, {
    signer: privyEvmSigner(account),
    networks: ["eip155:8453"],
  });

  return {
    siwx: wrapFetchWithSIWx(fetch, account) as Clients["siwx"],
    pay: wrapFetchWithPayment(fetch, client) as Clients["pay"],
  };
}

function clientsFor(wallet: UserWallet): Promise<Clients> {
  const cached = _clientsByWallet.get(wallet.id);
  if (cached) return cached;

  const built = buildClientsFor(wallet);
  _clientsByWallet.set(wallet.id, built);
  return built;
}

// Per-user Laso id_token (each user's wallet signs in, so tokens are per wallet).
const _tokenByWallet = new Map<string, { value: string; expiresAt: number }>();

function cacheAuthFromResponse(wallet: UserWallet, data: unknown) {
  if (!isRecord(data)) return;
  const auth = data.auth;
  if (!isRecord(auth) || typeof auth.id_token !== "string") return;
  const expiresIn = Number(auth.expires_in ?? 3600);
  _tokenByWallet.set(wallet.id, {
    value: auth.id_token,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
  });
}

async function idTokenFor(wallet: UserWallet): Promise<string> {
  const cached = _tokenByWallet.get(wallet.id);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;
  const clients = await clientsFor(wallet);
  const res = await clients.siwx(`${BASE_URL}/auth`);
  if (!res.ok) throw new Error(`Laso /auth failed: ${res.status}`);
  const data = await res.json();
  const token = data?.auth?.id_token as string;
  const expiresIn = Number(data?.auth?.expires_in ?? 3600);
  if (!token) throw new Error("Laso /auth returned no id_token");
  _tokenByWallet.set(wallet.id, {
    value: token,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return token;
}

async function bearer(wallet: UserWallet, path: string, init?: RequestInit) {
  const token = await idTokenFor(wallet);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(lasoError(path, res, text, wallet));
  }
  return res.json();
}

async function paid(wallet: UserWallet, path: string) {
  const clients = await clientsFor(wallet);
  const res = await clients.pay(`${BASE_URL}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(lasoError(path, res, text, wallet));
  }
  const data = await res.json();
  cacheAuthFromResponse(wallet, data);
  return data;
}

/** Order an international (non-reloadable) prepaid card, paid from the user's wallet. */
export function orderIntlCard(wallet: UserWallet, amount: number) {
  return paid(wallet, `/order-intl-card?amount=${encodeURIComponent(amount)}`);
}

/** Order a U.S. prepaid card (ready in ~10s), paid from the user's wallet. */
export function orderUsCard(wallet: UserWallet, amount: number) {
  return paid(wallet, `/get-card?amount=${encodeURIComponent(amount)}`);
}

/** Card details + available balance for the user. */
export function getCardData(wallet: UserWallet, cardType: string, cardId?: string) {
  const params = new URLSearchParams({ card_type: cardType });
  if (cardId) params.set("card_id", cardId);
  return bearer(wallet, `/get-card-data?${params.toString()}`);
}

export function getAccountBalance(wallet: UserWallet) {
  return bearer(wallet, `/get-account-balance`);
}

export function cancelIntlOrder(wallet: UserWallet, cardId: string) {
  return bearer(wallet, `/cancel-intl-order`, {
    method: "POST",
    body: JSON.stringify({ card_id: cardId }),
  });
}

export function refreshCardData(
  wallet: UserWallet,
  cardId: string,
  cardType: string
) {
  return bearer(wallet, `/refresh-card-data`, {
    method: "POST",
    body: JSON.stringify({ card_id: cardId, card_type: cardType }),
  });
}
