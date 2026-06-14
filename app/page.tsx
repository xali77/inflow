"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

/* ---- minimal stroke icons ---- */
const icon = (children: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden
  >
    {children}
  </svg>
);
const IconReceive = icon(<><path d="M12 4v10" /><path d="M8 10l4 4 4-4" /><path d="M5 20h14" /></>);
const IconScore = icon(<><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-4" /><path d="M12 16V9" /><path d="M16 16v-6" /></>);
const IconCredit = icon(<><circle cx="9" cy="9" r="5" /><path d="M14.5 5.3a5 5 0 0 1 0 9.4" /><path d="M9 7v4l2.5 1.5" /></>);
const IconShield = icon(<><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="M9 12l2 2 4-4" /></>);
const IconWallet = icon(<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14" r="1.1" fill="currentColor" stroke="none" /></>);
const IconSwap = icon(<><path d="M4 8h13l-3-3" /><path d="M20 16H7l3 3" /></>);

const STATS = [
  { value: "~800M", label: "people rely on remittances" },
  { value: "1 in 8", label: "people in developing nations" },
  { value: "~$1T", label: "flows across borders yearly" },
];

const STEPS = [
  {
    n: "01",
    title: "Receive money",
    body: "Family sends you USDC. It lands in seconds in a wallet you open with just an email.",
  },
  {
    n: "02",
    title: "Build your FlowScore",
    body: "Every remittance grows your FlowScore and a per-sender LineScore — a credit history where none existed.",
  },
  {
    n: "03",
    title: "Unlock credit",
    body: "Borrow against that reputation. Undercollateralized cash advances, backed by the people who already support you.",
  },
];

const FEATURES = [
  {
    icon: IconScore,
    title: "Reputation as credit",
    body: "Consistent inflows compound into a FlowScore — an alternative to credit bureaus that don't exist where you live.",
  },
  {
    icon: IconCredit,
    title: "Undercollateralized loans",
    body: "Get a cash advance without locking up the full amount. Your sender posts a fraction based on your scores.",
  },
  {
    icon: IconReceive,
    title: "Instant remittances",
    body: "Send and receive USDC globally on Base — settled in seconds, for cents, not days and double-digit fees.",
  },
  {
    icon: IconShield,
    title: "Verified humans",
    body: "World ID proves one real person per account — Sybil-resistant credit you can actually trust.",
  },
  {
    icon: IconWallet,
    title: "No seed phrases",
    body: "Sign in with email or phone. A secure embedded wallet is created for you — recurring payments run automatically.",
  },
  {
    icon: IconSwap,
    title: "Grow & swap",
    body: "Earn yield on idle balances or swap into any token, right inside the app.",
  },
];

export default function Landing() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) router.replace("/home");
  }, [ready, authenticated, router]);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 font-semibold">
          <Image src="/logo.png" alt="Flows" width={28} height={28} priority className="rounded-lg" />
          Flows
        </span>
        <button
          onClick={login}
          disabled={!ready}
          className="text-ink-soft rounded-full border border-line px-5 py-2 text-sm transition-colors hover:text-ink hover:border-ink-soft/40 disabled:opacity-50"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center sm:pt-24">
        <p className="eyebrow text-accent">Remittance-powered credit</p>
        <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
          Money that arrives
          <br />
          builds your credit.
        </h1>
        <p className="text-ink-soft mx-auto mt-5 max-w-xl text-base sm:text-lg">
          Flows turns the money your family sends home into a credit history — unlocking
          undercollateralized loans for the ~800M people the financial system forgot.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={login}
            disabled={!ready}
            className="bg-ink text-ground rounded-full px-8 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Get started
          </button>
          <a
            href="#how"
            className="text-ink-soft rounded-full border border-line px-8 py-3 text-sm transition-colors hover:text-ink hover:border-ink-soft/40"
          >
            How it works
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-4xl px-6">
        <div className="card grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STATS.map((s) => (
            <div key={s.label} className="px-6 py-6 text-center">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{s.value}</p>
              <p className="text-ink-soft mt-1 text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-5xl scroll-mt-8 px-6 py-20">
        <div className="mb-10 text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            From remittances to a credit line
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-6">
              <p className="text-accent text-sm font-semibold tabular-nums">{s.n}</p>
              <h3 className="mt-3 text-lg font-medium">{s.title}</h3>
              <p className="text-ink-soft mt-2 text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="mb-10 text-center">
          <p className="eyebrow">What you get</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            A neobank built on trust, not paperwork
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <span className="bg-accent/10 text-accent flex h-10 w-10 items-center justify-center rounded-xl">
                {f.icon}
              </span>
              <h3 className="mt-4 text-base font-medium">{f.title}</h3>
              <p className="text-ink-soft mt-1.5 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div className="card relative overflow-hidden p-10 text-center">
          <div className="bg-accent/5 pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl" />
          <h2 className="relative text-2xl font-semibold tracking-tight sm:text-3xl">
            Start building your score today
          </h2>
          <p className="text-ink-soft relative mt-3">
            Open an account with your email in under a minute.
          </p>
          <button
            onClick={login}
            disabled={!ready}
            className="bg-ink text-ground relative mt-6 rounded-full px-8 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Get started
          </button>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="text-ink-soft mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-xs">
          <span className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={18} height={18} className="rounded" />
            Flows
          </span>
          <span>Money that arrives builds your score.</span>
        </div>
      </footer>
    </main>
  );
}
