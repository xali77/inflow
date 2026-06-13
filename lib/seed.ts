import type { AppEvent } from "./events";

// Generates a coherent fake platform: senders in source countries remitting to
// receivers across corridors over ~90 days, plus grow/lock/card/swap behavior.
// Used to populate the admin dashboard and exercise the FlowScore engine.
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
const money = (lo: number, hi: number) => Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
function addr() {
  let h = "0x";
  for (let i = 0; i < 40; i++) h += "0123456789abcdef"[rand(16)];
  return h;
}

export function generateSeedEvents(receiverCount = 36): SeedEvent[] {
  const events: SeedEvent[] = [];
  const senderPools: Record<string, { address: string; name: string; country: string }[]> = {};

  function getSender(fromCountry: string) {
    const pool = senderPools[fromCountry] ?? (senderPools[fromCountry] = []);
    if (pool.length < 4 || Math.random() < 0.5) {
      const s = { address: addr(), name: pick(NAMES), country: fromCountry };
      pool.push(s);
      const signup = 60 + rand(30);
      events.push({
        type: "onboarding.completed",
        address: s.address,
        created_at: daysAgo(signup),
        payload: { country: fromCountry, role: "sender", name: s.name },
      });
      if (Math.random() < 0.8)
        events.push({ type: "identity.verified", address: s.address, created_at: daysAgo(signup), payload: {} });
      return s;
    }
    return pick(pool);
  }

  for (let i = 0; i < receiverCount; i++) {
    const corridor = pick(CORRIDORS);
    const receiver = { address: addr(), name: pick(NAMES), country: corridor.to };
    const signupDay = 55 + rand(35);

    events.push({
      type: "onboarding.completed",
      address: receiver.address,
      created_at: daysAgo(signupDay),
      payload: { country: corridor.to, role: "receiver", name: receiver.name },
    });
    if (Math.random() < 0.75)
      events.push({ type: "identity.verified", address: receiver.address, created_at: daysAgo(signupDay - 1), payload: {} });

    // Recurring remittances with slight upward growth over time.
    const sender = getSender(corridor.from);
    const cadence = pick([7, 14, 30]);
    const base = money(60, 450);
    for (let d = signupDay - 2; d >= 1; d -= cadence) {
      const progress = 1 - d / signupDay;
      const amount = Math.round(base * (0.85 + 0.4 * progress) * 100) / 100;
      const ts = daysAgo(d);
      events.push({
        type: "remittance.received",
        address: receiver.address,
        amount_usd: amount,
        created_at: ts,
        payload: { from: sender.address, from_country: sender.country, from_name: sender.name, hash: "0xseed" },
      });
      events.push({
        type: "remittance.sent",
        address: sender.address,
        amount_usd: amount,
        created_at: ts,
        payload: { to: receiver.address, to_country: receiver.country, to_name: receiver.name, hash: "0xseed" },
      });
    }

    const after = () => daysAgo(2 + rand(Math.max(signupDay - 5, 4)));
    if (Math.random() < 0.5)
      for (let k = 0; k < 1 + rand(3); k++)
        events.push({ type: "grow.deposit", address: receiver.address, amount_usd: money(20, 300), created_at: after(), payload: { vault: "seed" } });
    if (Math.random() < 0.3) {
      const months = pick([3, 6, 12]);
      events.push({
        type: "lock.created",
        address: receiver.address,
        amount_usd: money(50, 400),
        created_at: after(),
        payload: { months, apy: months === 3 ? 4 : months === 6 ? 6.5 : 9 },
      });
    }
    if (Math.random() < 0.25) {
      const intl = Math.random() < 0.5;
      events.push({
        type: "card.order",
        address: receiver.address,
        amount_usd: intl ? money(100, 500) : money(5, 200),
        created_at: after(),
        payload: { card_type: intl ? "intl" : "us" },
      });
    }
    if (Math.random() < 0.4)
      for (let k = 0; k < 1 + rand(4); k++)
        events.push({
          type: "swap.executed",
          address: receiver.address,
          amount_usd: money(10, 190),
          created_at: after(),
          payload: { fromToken: "USDC", toToken: pick(TOKENS), fromChain: 8453, toChain: pick([8453, 42161, 10]) },
        });
  }

  return events;
}
