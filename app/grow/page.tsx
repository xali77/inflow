"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import Sidebar from "@/components/sidebar";
import GrowCard from "@/components/grow-card";
import LocksCard from "@/components/locks-card";

export default function Grow() {
  const { ready, authenticated, logout, user } = usePrivy();
  const router = useRouter();
  const address = user?.wallet?.address;

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center">
        <p className="text-ink-soft text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1">
        <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:hidden">
          <span className="flex items-center gap-2 font-medium">
            <Image src="/logo.png" alt="Flows" width={24} height={24} className="rounded-md" />
            Flows
          </span>
          <button
            onClick={logout}
            className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft"
          >
            Log out
          </button>
        </div>

        <main className="mx-auto max-w-2xl px-5 py-6 lg:px-10 lg:py-9">
          <div className="mb-2">
            <h1 className="text-2xl font-semibold tracking-tight">Grow</h1>
            <p className="text-ink-soft mt-0.5 text-sm">
              Earn yield on your balance, paid from your own wallet.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-4">
            <GrowCard address={address} />
            <LocksCard address={address} />
          </div>
        </main>
      </div>
    </div>
  );
}
