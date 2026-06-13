# Inflow

A remittance neobank. Money that arrives builds your score.

One unified home screen serves both senders and receivers: anyone logged in can
send and receive; the FlowScore ring and credit layer only activate after World
ID human verification. Senders simply never verify; receivers do.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- [Privy](https://privy.io) embedded wallets (email + SMS login, no seed phrase)
- [World ID](https://world.org/world-id) human verification with **server-side
  proof validation** (`@worldcoin/idkit` v2 — pinned because v4 dropped the
  `IDKitWidget` incognito-actions API this app uses)
- viem for chain reads (Arc testnet default, Base mainnet)

## Setup

1. **Install**

   ```sh
   pnpm install
   ```

2. **Privy app ID** — create an app at [dashboard.privy.io](https://dashboard.privy.io).
   Enable email and SMS login. Copy the App ID.

3. **World ID app** — create a **staging** app at
   [developer.worldcoin.org](https://developer.worldcoin.org). Add an
   **incognito action** named `verify-human`. Copy the app ID (`app_staging_…`).
   Test proofs with the [World ID simulator](https://simulator.worldcoin.org).

4. **Env vars** — fill `.env.local` (template in `.env.example`):

   ```
   NEXT_PUBLIC_PRIVY_APP_ID=        # from dashboard.privy.io
   NEXT_PUBLIC_PRIVY_CLIENT_ID=     # optional; dashboard → App settings → Clients
   NEXT_PUBLIC_WLD_APP_ID=          # app_staging_… from developer.worldcoin.org
   NEXT_PUBLIC_WLD_ACTION=verify-human
   NEXT_PUBLIC_ARC_RPC_URL=         # TODO: from Arc docs at the venue
   NEXT_PUBLIC_ARC_CHAIN_ID=        # TODO: from Arc docs
   NEXT_PUBLIC_ARC_USDC_ADDRESS=    # optional; falls back to native balance on Arc
   SUPABASE_URL=                    # optional
   SUPABASE_ANON_KEY=               # optional
   PRIVY_APP_SECRET=                # server-only; Privy wallet API for in-app send
   PRIVY_AUTHORIZATION_PRIVATE_KEY= # server-only; only if you add a Privy authorization key
   ```

   Client-side sends from the embedded wallet need only the app ID; the
   server-only Privy keys are for server-initiated wallet API calls (build 2).
   They must never be exposed with a `NEXT_PUBLIC_` prefix.

   If the Arc vars are empty the app boots on Base mainnet only (with a console
   warning). If the Supabase vars are empty, persistence falls back to a local
   JSON file at `.data/store.json` (gitignored).

5. **Run**

   ```sh
   pnpm dev
   ```

## How verification works

The IDKit widget collects a World ID proof in the browser and POSTs it to
`/api/verify-worldid`. The server calls World's v2 verify endpoint
(`https://developer.worldcoin.org/api/v2/verify/{app_id}`) with the proof,
action, and signal — the signal is the user's Privy wallet address. On success
the server persists `{ nullifier_hash, wallet_address, verified_at }` and
rejects any nullifier already bound to a different wallet: one human, one
account. Client-side verification is never trusted alone, and no auth or
verification state is kept in localStorage.

## Supabase (optional)

If you set the Supabase env vars, create the key-value table the storage
adapter expects:

```sql
create table kv (key text primary key, value jsonb);
```

## Deploy

Push to GitHub, import in Vercel, set the same env vars (use Supabase in
production — the JSON file store is per-instance and ephemeral on Vercel).
