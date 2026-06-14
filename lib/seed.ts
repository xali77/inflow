import type { AppEvent } from "./events";

// Generates a coherent fake platform: receivers across remittance corridors with
// varied richness, so the FlowScore engine produces a realistic spread across
// every band (Poor → Excellent), plus grow/lock/card/swap behavior and a few
// loan lifecycles. Used to populate the admin dashboard and exercise scoring.
type SeedEvent = AppEvent & { created_at: string };

const CORRIDORS = [
  { from: "US", to: "MX" },
  { from: "US", to: "PH" },
  { from: "US", to: "IN" },
  { from: "AE", to: "IN" },
  { from: "GB", to: "NG" },
  { from: "SA", to: "PK" },
  { from: "CA", to: "PH" },
  { from: "DE", to: "TR" },
  { from: "AU", to: "VN" },
];

const NAMES = [
  "Amara", "Diego", "Mei", "Olamide", "Priya", "Carlos", "Aisha", "Tariq",
  "Lucia", "Kwame", "Ravi", "Sofia", "Hassan", "Ngozi", "Juan", "Fatima",
  "Chen", "Marco", "Zara", "Ibrahim", "Elena", "Mateo", "Sana", "Kofi",
];
const TOKENS = ["ETH", "WBTC", "PEPE", "BONK", "SOL", "DEGEN"];

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rand(a.length)];
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const money = (lo: number, hi: number) => Math.round(between(lo, hi) * 100) / 100;
const daysAgo = (d: number) => new Date(Date.now() - Math.max(d, 0) * 86_400_000).toISOString();
function addr() {
  let h = "0x";
  for (let i = 0; i < 40; i++) h += "0123456789abcdef"[rand(16)];
  return h;
}

type Tier = {
  band: string;
  weight: number;
  lines: [number, number]; // distinct senders
  span: [number, number]; // history length in days
  cadence: number[]; // payment interval options
  base: [number, number]; // payment size
  savingsRate: [number, number]; // saved / received
  swaps: [number, number];
  scheduledRatio: number; // fraction of payments marked scheduled
  repaidLoans: number;
  badLoans: number; // delinquent/defaulted
  verifiedChance: number;
};

// Probability-weighted tiers — tuned so scores land across all five bands.
const TIERS: Tier[] = [
  { band: "excellent", weight: 0.18, lines: [2, 2], span: [110, 140], cadence: [7, 14], base: [340, 600], savingsRate: [0.85, 1.0], swaps: [7, 11], scheduledRatio: 0.85, repaidLoans: 2, badLoans: 0, verifiedChance: 1 },
  { band: "veryGood", weight: 0.22, lines: [1, 2], span: [95, 120], cadence: [7, 14], base: [260, 460], savingsRate: [0.6, 0.9], swaps: [5, 8], scheduledRatio: 0.7, repaidLoans: 1, badLoans: 0, verifiedChance: 1 },
  { band: "good", weight: 0.25, lines: [1, 1], span: [80, 110], cadence: [7, 14], base: [200, 380], savingsRate: [0.4, 0.65], swaps: [3, 6], scheduledRatio: 0.5, repaidLoans: 1, badLoans: 0, verifiedChance: 1 },
  { band: "fair", weight: 0.22, lines: [1, 1], span: [55, 85], cadence: [14, 30], base: [120, 260], savingsRate: [0.15, 0.4], swaps: [1, 3], scheduledRatio: 0.25, repaidLoans: 0, badLoans: 0, verifiedChance: 0.85 },
  { band: "poor", weight: 0.13, lines: [1, 1], span: [12, 35], cadence: [14, 30], base: [30, 90], savingsRate: [0, 0.05], swaps: [0, 1], scheduledRatio: 0, repaidLoans: 0, badLoans: 1, verifiedChance: 0.45 },
];

function pickTier(): Tier {
  let r = Math.random();
  for (const t of TIERS) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return TIERS[TIERS.length - 1];
}

export function generateSeedEvents(receiverCount = 40): SeedEvent[] {
  const events: SeedEvent[] = [];
  const senderPools: Record<string, { address: string; name: string; country: string }[]> = {};

  // Small, reused sender pools so receivers dominate the user base.
  function getSender(fromCountry: string) {
    const pool = senderPools[fromCountry] ?? (senderPools[fromCountry] = []);
    if (pool.length < 1 || Math.random() < 0.2) {
      const s = { address: addr(), name: pick(NAMES), country: fromCountry };
      pool.push(s);
      const signup = 90 + rand(40);
      events.push({
        type: "onboarding.completed",
        address: s.address,
        created_at: daysAgo(signup),
        payload: { country: fromCountry, role: "sender", name: s.name },
      });
      if (Math.random() < 0.85)
        events.push({ type: "identity.verified", address: s.address, created_at: daysAgo(signup), payload: {} });
      return s;
    }
    return pick(pool);
  }

  for (let i = 0; i < receiverCount; i++) {
    const corridor = pick(CORRIDORS);
    const tier = pickTier();
    const receiver = { address: addr(), name: pick(NAMES), country: corridor.to };
    const span = Math.round(between(tier.span[0], tier.span[1]));
    const signupDay = span + 2;

    events.push({
      type: "onboarding.completed",
      address: receiver.address,
      created_at: daysAgo(signupDay),
      payload: { country: corridor.to, role: "receiver", name: receiver.name },
    });
    if (Math.random() < tier.verifiedChance)
      events.push({ type: "identity.verified", address: receiver.address, created_at: daysAgo(signupDay - 1), payload: {} });

    // One or two remittance lines, each a recurring stream with slight growth.
    const lineCount = Math.round(between(tier.lines[0], tier.lines[1]));
    let receivedTotal = 0;
    for (let l = 0; l < lineCount; l++) {
      const sender = getSender(corridor.from);
      const cadence = pick(tier.cadence);
      const base = money(tier.base[0], tier.base[1]);
      for (let d = span; d >= 1; d -= cadence) {
        const progress = 1 - d / span;
        const amount = Math.round(base * (0.85 + 0.45 * progress) * 100) / 100;
        receivedTotal += amount;
        const ts = daysAgo(d);
        const scheduled = Math.random() < tier.scheduledRatio;
        events.push({
          type: "remittance.received",
          address: receiver.address,
          amount_usd: amount,
          created_at: ts,
          payload: { from: sender.address, from_country: sender.country, from_name: sender.name, hash: "0xseed", scheduled },
        });
        events.push({
          type: "remittance.sent",
          address: sender.address,
          amount_usd: amount,
          created_at: ts,
          payload: { to: receiver.address, to_country: receiver.country, to_name: receiver.name, hash: "0xseed", scheduled },
        });
      }
    }

    const after = () => daysAgo(1 + rand(Math.max(span - 4, 3)));

    // Savings (grow + locks) drive the liquidity signal.
    const savingsTarget = receivedTotal * between(tier.savingsRate[0], tier.savingsRate[1]);
    let saved = 0;
    while (saved < savingsTarget && saved < receivedTotal) {
      const amt = Math.min(money(50, 350), savingsTarget - saved + 1);
      saved += amt;
      events.push({ type: "grow.deposit", address: receiver.address, amount_usd: amt, created_at: after(), payload: { vault: "seed" } });
    }
    if (savingsTarget > 200 && Math.random() < 0.5) {
      const months = pick([3, 6, 12]);
      events.push({
        type: "lock.created",
        address: receiver.address,
        amount_usd: money(80, 400),
        created_at: after(),
        payload: { months, apy: months === 3 ? 4 : months === 6 ? 6.5 : 9 },
      });
    }

    // Swaps drive the trading signal.
    const swaps = Math.round(between(tier.swaps[0], tier.swaps[1]));
    for (let k = 0; k < swaps; k++)
      events.push({
        type: "swap.executed",
        address: receiver.address,
        amount_usd: money(15, 240),
        created_at: after(),
        payload: { fromToken: "USDC", toToken: pick(TOKENS), fromChain: 8453, toChain: pick([8453, 42161, 10]) },
      });

    // Cards (no score weight, but populate the Cards domain).
    if (Math.random() < 0.3) {
      const intl = Math.random() < 0.5;
      events.push({
        type: "card.order",
        address: receiver.address,
        amount_usd: intl ? money(100, 500) : money(5, 200),
        created_at: after(),
        payload: { card_type: intl ? "intl" : "us" },
      });
    }

    // Loan lifecycles — repaid loans lift repayment; bad loans add risk + penalties.
    for (let k = 0; k < tier.repaidLoans; k++) {
      const principal = money(150, 600);
      const fundedAt = 8 + rand(Math.max(span - 12, 6));
      events.push({ type: "loan.funded", address: receiver.address, amount_usd: principal, created_at: daysAgo(fundedAt), payload: { hash: "0xseed" } });
      events.push({ type: "loan.repaid", address: receiver.address, amount_usd: Math.round(principal * 1.05 * 100) / 100, created_at: daysAgo(Math.max(fundedAt - 25, 1)), payload: { hash: "0xseed" } });
    }
    for (let k = 0; k < tier.badLoans; k++) {
      const principal = money(80, 300);
      events.push({ type: "loan.funded", address: receiver.address, amount_usd: principal, created_at: after(), payload: { hash: "0xseed" } });
      events.push({
        type: Math.random() < 0.5 ? "loan.delinquent" : "loan.defaulted",
        address: receiver.address,
        amount_usd: principal,
        created_at: after(),
        payload: { hash: "0xseed" },
      });
    }
  }

  return events;
}
