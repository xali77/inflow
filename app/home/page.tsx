"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import Sidebar from "@/components/sidebar";
import Balance from "@/components/balance";
import WorldIdVerify from "@/components/world-id-verify";
import SendSheet from "@/components/send-sheet";
import ReceiveSheet from "@/components/receive-sheet";
import ActivityList from "@/components/activity-list";
import { useRamp } from "@/components/use-ramp";
import ScheduledModal from "@/components/scheduled-modal";
import FlowLinesModal from "@/components/flowlines-modal";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const sIcon = (children: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-[18px] w-[18px]"
    aria-hidden
  >
    {children}
  </svg>
);
const ClockIcon = sIcon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5l3 1.8" /></>);
const FlowIcon = sIcon(<><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="12" r="2.4" /><path d="M8.4 12h7.2" /></>);
const DepositIcon = sIcon(<><path d="M12 3v10" /><path d="M8 9.5l4 4 4-4" /><path d="M4.5 19.5h15" /></>);
const WithdrawIcon = sIcon(<><path d="M12 13.5V3.5" /><path d="M8 7.5l4-4 4 4" /><path d="M4.5 19.5h15" /></>);

export default function Home() {
  const { ready, authenticated, logout, user } = usePrivy();
  const router = useRouter();
  const address = user?.wallet?.address;

  const [verified, setVerified] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [openSheet, setOpenSheet] = useState<"send" | "receive" | null>(null);
  const [openModal, setOpenModal] = useState<"scheduled" | "flowlines" | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [profileReady, setProfileReady] = useState(false);
  const { open: openRamp, busy: rampBusy } = useRamp(() => setRefresh((n) => n + 1));

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!authenticated || !address) return;
    fetch(`/api/profile?address=${address}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          setName(data.profile.name ?? null);
          setProfileReady(true);
        } else {
          router.replace("/onboarding");
        }
      })
      .catch(() => setProfileReady(true));
  }, [authenticated, address, router]);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/verify-worldid?address=${address}`)
      .then((res) => res.json())
      .then((data) => setVerified(!!data.verified))
      .catch(() => {});
  }, [address]);

  // Count due scheduled payments for the home-screen badge.
  useEffect(() => {
    if (!address) return;
    fetch(`/api/schedules?address=${address}`)
      .then((res) => res.json())
      .then((d) => {
        const now = Date.now();
        const due = (d.schedules ?? []).filter(
          (s: { active: boolean; next_run: string }) =>
            s.active && new Date(s.next_run).getTime() <= now
        ).length;
        setDueCount(due);
      })
      .catch(() => {});
  }, [address, refresh, openModal]);

  if (!ready || !authenticated || !profileReady) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center">
        <p className="text-ink-soft text-sm">Loading…</p>
      </main>
    );
  }

  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex-1">
        {/* Mobile top bar (sidebar is hidden below lg) */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:hidden">
          <span className="flex items-center gap-2 font-medium">
            <Image src="/logo.png" alt="Flows" width={24} height={24} className="rounded-md" />
            Flows
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/cards")}
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft"
            >
              Card
            </button>
            <button
              onClick={logout}
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-soft"
            >
              Log out
            </button>
          </div>
        </div>

        <main className="mx-auto max-w-5xl px-5 py-6 lg:px-10 lg:py-9">
          {/* Greeting */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting()}
              {name ? `, ${name}` : ""}
            </h1>
            <p className="text-ink-soft mt-0.5 text-sm">{dateStr}</p>
          </div>

          {/* Dashboard grid */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <section className="card relative overflow-hidden p-6">
                <div className="bg-accent/5 pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-2xl" />
                <div className="relative">
                  <Balance address={address} reloadSignal={refresh} />
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setOpenSheet("send")}
                      className="bg-ink text-ground flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-medium transition-opacity hover:opacity-90"
                    >
                      ↑ Send
                    </button>
                    <button
                      onClick={() => setOpenSheet("receive")}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-ground py-3 text-sm font-medium text-ink transition-colors hover:border-ink-soft/40"
                    >
                      ↓ Receive
                    </button>
                  </div>

                  {/* Secondary utilities */}
                  <div className="mt-4 grid grid-cols-4 gap-1 border-t border-line pt-4">
                    <button
                      onClick={() => setOpenModal("scheduled")}
                      className="text-ink-soft hover:bg-ground relative flex flex-col items-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium transition-colors hover:text-ink"
                    >
                      {ClockIcon}
                      Scheduled
                      {dueCount > 0 && (
                        <span className="bg-accent text-ground absolute right-3 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                          {dueCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setOpenModal("flowlines")}
                      className="text-ink-soft hover:bg-ground flex flex-col items-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium transition-colors hover:text-ink"
                    >
                      {FlowIcon}
                      FlowLines
                    </button>
                    <button
                      onClick={() => openRamp("BUY")}
                      disabled={rampBusy !== null}
                      className="text-ink-soft hover:bg-ground flex flex-col items-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium transition-colors hover:text-ink disabled:opacity-50"
                    >
                      {DepositIcon}
                      {rampBusy === "BUY" ? "Opening…" : "Add money"}
                    </button>
                    <button
                      onClick={() => openRamp("SELL")}
                      disabled={rampBusy !== null}
                      className="text-ink-soft hover:bg-ground flex flex-col items-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium transition-colors hover:text-ink disabled:opacity-50"
                    >
                      {WithdrawIcon}
                      {rampBusy === "SELL" ? "Opening…" : "Cash out"}
                    </button>
                  </div>
                </div>
              </section>
              <ActivityList address={address} reloadSignal={refresh} />
            </div>

            <div className="flex flex-col gap-4">
              <section className="card flex flex-col items-center gap-5 p-6">
                <p className="eyebrow self-start">FlowScore</p>
                <WorldIdVerify
                  address={address}
                  verified={verified}
                  onVerified={() => setVerified(true)}
                />
              </section>
            </div>
          </div>
        </main>
      </div>

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
      <ScheduledModal
        open={openModal === "scheduled"}
        onClose={() => setOpenModal(null)}
        address={address}
        onChange={() => setRefresh((n) => n + 1)}
      />
      <FlowLinesModal
        open={openModal === "flowlines"}
        onClose={() => setOpenModal(null)}
        address={address}
      />
    </div>
  );
}
