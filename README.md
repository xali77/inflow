# Flows

A remittance neobank. Money that arrives builds your score.

One unified home screen serves both senders and receivers: anyone logged in can
send and receive; the FlowScore ring and credit layer only activate after World
ID human verification. Senders simply never verify; receivers do.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- [Privy](https://privy.io) embedded wallets (email + SMS login, no seed phrase)
- [World ID 4.0](https://docs.world.org/world-id/overview) human verification
  (`@worldcoin/idkit` 4.x) with a **backend RP signature** and **server-side
  proof validation** — soft KYC by proof of human, one human per account
- viem for chain reads (Arc testnet default, Base mainnet)

## Setup

1. **Install**

   ```sh
   pnpm install
   ```

2. **Privy app ID** — create an app at [dashboard.privy.io](https://dashboard.privy.io).
   Enable email and SMS login. Copy the App ID.

3. **World ID 4.0 app** — create an app at
   [developer.world.org](https://developer.world.org) and click **Enable World
   ID 4.0** to register a Relying Party. Create an action named `verify-human`.
   Copy three values: the **app ID** (`app_…`), the **RP ID** (`rp_…`), and the
   **RP signing key** (store as a secret). Test proofs with the
   [simulator](https://simulator.worldcoin.org) (set environment to staging).

4. **Env vars** — fill `.env.local` (template in `.env.example`):

   ```
   NEXT_PUBLIC_PRIVY_APP_ID=        # from dashboard.privy.io
   NEXT_PUBLIC_PRIVY_CLIENT_ID=     # optional; dashboard → App settings → Clients
   NEXT_PUBLIC_WLD_APP_ID=          # app_…  from developer.world.org
   NEXT_PUBLIC_WLD_RP_ID=           # rp_…   from "Enable World ID 4.0"
   WLD_RP_SIGNING_KEY=              # server-only secret; signs verification requests
   NEXT_PUBLIC_WLD_ACTION=verify-human
   NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
   NEXT_PUBLIC_ARC_CHAIN_ID=5042002
   NEXT_PUBLIC_ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
   SUPABASE_URL=                    # optional
   SUPABASE_ANON_KEY=               # optional
   PRIVY_APP_SECRET=                # server-only; Privy wallet API for in-app send
   PRIVY_AUTHORIZATION_PRIVATE_KEY= # server-only; only if you add a Privy authorization key
   ```

   Client-side sends from the embedded wallet need only the app ID; the
   server-only Privy keys are for server-initiated wallet API calls (build 2).
   They must never be exposed with a `NEXT_PUBLIC_` prefix.

   **Base mainnet** (chain `8453`) is the default chain — it's where Privy Earn
   (Morpho USDC vaults) lives. USDC balance is read through the USDC ERC-20
   interface (6 decimals). Note: on Base, gas is paid in **ETH**, so the
   embedded wallet needs a little ETH to send (or configure a Privy paymaster to
   sponsor gas). Arc testnet stays available as a secondary chain when its
   `NEXT_PUBLIC_ARC_*` env vars are set. If the Supabase vars are empty,
   persistence falls back to a local JSON file at `.data/store.json`
   (gitignored).

5. **Run**

   ```sh
   pnpm dev
   ```

## How verification works (World ID 4.0)

Soft KYC by proof of human: prove you're a unique person, no documents.

1. **Sign** — when the user taps Verify, the client asks `POST /api/worldid/sign`.
   The backend signs the proof request with the secret `WLD_RP_SIGNING_KEY`
   (`signRequest` from `@worldcoin/idkit/signing`) and returns the `rp_context`
   (rp_id, nonce, signature, 5-minute TTL). The action is signed server-side, so
   it can't be tampered with by the client.
2. **Prove** — `IDKitRequestWidget` collects a `proofOfHuman` proof in World App
   (or the simulator), with the user's Privy wallet address as the signal.
3. **Verify** — the client POSTs the proof to `/api/verify-worldid`, which
   forwards it to World's v4 verify endpoint
   (`https://developer.world.org/api/v4/verify/{rp_id}`) for cryptographic
   validation, then confirms the proof's `signal_hash` matches `hash(wallet)` so
   a valid proof can't be replayed to bind a different account.
4. **Bind** — on success the server persists `{ nullifier, wallet_address,
   action, verified_at }` and rejects any nullifier already linked to a
   different wallet: **one human, one account** — the Sybil-resistance
   constraint the FlowScore credit layer depends on.

Client-side verification is never trusted alone, and no auth or verification
state is kept in localStorage.

## Supabase (optional)

If you set the Supabase env vars, create the key-value table the storage
adapter expects:

```sql
create table kv (key text primary key, value jsonb);
```

## Deploy

Push to GitHub, import in Vercel, set the same env vars (use Supabase in
production — the JSON file store is per-instance and ephemeral on Vercel).

## FlowPool Contract

The lending pool contract lives at `contracts/src/FlowPool.sol` and is deployed
with Foundry from `contracts/script/Deploy.s.sol`. For v1 it targets Base
Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`).

1. Create a backend terms signer:

   ```sh
   cast wallet new
   ```

   Save its private key as `FLOWPOOL_SIGNER_KEY`. The deploy script derives the
   contract `termsSigner` address from this key, and the Next.js API uses the
   same key to sign loan terms.

2. Set deploy env and fund the deployer with Base Sepolia ETH:

   ```sh
   export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   export DEPLOYER_KEY=0x...
   export FLOWPOOL_SIGNER_KEY=0x...
   export FEE_BPS=1000
   ```

3. Test and deploy:

   ```sh
   cd contracts
   forge test -vvv
   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --private-key $DEPLOYER_KEY
   ```

4. Copy the printed `FlowPool deployed:` address into `.env.local` and restart
   the app:

   ```sh
   NEXT_PUBLIC_FLOWPOOL_ADDRESS=0x...
   NEXT_PUBLIC_BASE_SEPOLIA_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
   FLOWPOOL_SIGNER_KEY=0x...
   ```
