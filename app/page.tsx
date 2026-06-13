"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

export default function Landing() {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) router.replace("/home");
  }, [ready, authenticated, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <Image
        src="/logo.png"
        alt="Inflow"
        width={80}
        height={80}
        priority
        className="rounded-2xl"
      />
      <h1 className="text-3xl font-semibold tracking-tight">INFLOW</h1>
      <p className="text-ink-soft">Money that arrives builds your score.</p>
      <button
        onClick={login}
        disabled={!ready}
        className="rounded-xl border border-line bg-surface px-8 py-3 text-ink disabled:opacity-50"
      >
        Continue
      </button>
    </main>
  );
}
