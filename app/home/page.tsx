"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import Balance from "@/components/balance";
import WorldIdVerify from "@/components/world-id-verify";
import SendSheet from "@/components/send-sheet";
import ReceiveSheet from "@/components/receive-sheet";
import ActivityList from "@/components/activity-list";
import GrowCard from "@/components/grow-card";

export default function Home() {
  const { ready, authenticated, logout, user } = usePrivy();
  const router = useRouter();
  const address = user?.wallet?.address;

  const [verified, setVerified] = useState(false);
  const [openSheet, setOpenSheet] = useState<"send" | "receive" | null>(null);
  // Bumped after a send to refresh balance + activity.
  const [refresh, setRefresh] = useState(0);
  // Profile gate: new users must complete onboarding before reaching home.
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!authenticated || !address) return;
    fetch(`/api/profile?address=${address}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) setProfileReady(true);
        else router.replace("/onboarding");
      })
      .catch(() => setProfileReady(true));
  }, [authenticated, address, router]);

  // Verification state lives on the server, never in client storage.
  useEffect(() => {
    if (!address) return;
    fetch(`/api/verify-worldid?address=${address}`)
      .then((res) => res.json())
      .then((data) => setVerified(!!data.verified))
      .catch(() => {});
  }, [address]);

  if (!ready || !authenticated || !profileReady) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-ink-soft text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 pb-12">
      <header className="flex items-center justify-between py-5">
        <span className="flex items-center gap-2 font-medium">
          <Image
            src="/logo.png"
            alt="Inflow"
            width={26}
            height={26}
            className="rounded-lg"
          />
          Inflow
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/cards")}
            className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            Cards
          </button>
          <button
            onClick={logout}
            className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Balance + primary actions */}
      <section className="card p-6">
        <Balance address={address} reloadSignal={refresh} />
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => setOpenSheet("send")}
            className="rounded-xl border border-line bg-ground py-3 text-sm font-medium text-ink transition-colors hover:border-ink-soft/40"
          >
            Send
          </button>
          <button
            onClick={() => setOpenSheet("receive")}
            className="rounded-xl border border-line bg-ground py-3 text-sm font-medium text-ink transition-colors hover:border-ink-soft/40"
          >
            Receive
          </button>
        </div>
      </section>

      {/* FlowScore */}
      <section className="card flex flex-col items-center gap-5 p-6">
        <p className="eyebrow self-start">FlowScore</p>
        <WorldIdVerify
          address={address}
          verified={verified}
          onVerified={() => setVerified(true)}
        />
      </section>

      <GrowCard address={address} />

      <ActivityList address={address} reloadSignal={refresh} />

      <SendSheet
        open={openSheet === "send"}
        onClose={() => setOpenSheet(null)}
        address={address}
        onSent={() => setRefresh((n) => n + 1)}
      />
      <ReceiveSheet
        open={openSheet === "receive"}
        onClose={() => setOpenSheet(null)}
        address={address}
      />
    </main>
  );
}
