"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import CountrySelect from "@/components/country-select";

type Role = "sender" | "receiver";

export default function Onboarding() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const address = user?.wallet?.address;

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  // Not logged in → landing. Already has a profile → home.
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.replace("/");
      return;
    }
    if (!address) return;
    fetch(`/api/profile?address=${address}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) router.replace("/home");
        else setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [ready, authenticated, address, router]);

  const canSubmit =
    !!address && name.trim().length > 0 && !!country && !!role && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, name: name.trim(), country, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save. Try again.");
      }
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      setSubmitting(false);
    }
  };

  if (!ready || !authenticated || !checked) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-ink-soft text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Tell us about you
        </h1>
        <p className="text-ink-soft mt-1 text-sm">
          A few details to set up your account.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-soft text-sm">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-xl border border-line bg-ground px-4 py-3 text-ink placeholder:text-ink-soft/60 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink-soft text-sm">Country of residence</span>
          <CountrySelect value={country} onChange={setCountry} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-ink-soft text-sm">I&rsquo;m here to</span>
          <div className="grid grid-cols-2 gap-3">
            {(["sender", "receiver"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  role === r
                    ? "border-ink bg-surface text-ink"
                    : "border-line bg-ground text-ink-soft"
                }`}
              >
                {r === "sender" ? "Send money" : "Receive money"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="mt-2 rounded-xl border border-line bg-surface px-4 py-3 text-ink disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}
