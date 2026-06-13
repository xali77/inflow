"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { usePathname, useRouter } from "next/navigation";

type IconProps = { className?: string };
type Icon = (props: IconProps) => React.ReactElement;
type NavItem = { label: string; href: string; icon: Icon };

const svg = (children: React.ReactNode): Icon =>
  function NavIcon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        {children}
      </svg>
    );
  };

const HomeIcon = svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>);
const WalletIcon = svg(
  <>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
  </>
);
const CardIcon = svg(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M3 9.5h18" />
    <path d="M6.5 14.5h4" />
  </>
);
const SproutIcon = svg(
  <>
    <path d="M12 20v-7" />
    <path d="M12 13c0-3 2.2-5 5.2-5 0 3-2.2 5-5.2 5Z" />
    <path d="M12 14c0-2.6-1.9-4.6-4.7-4.6 0 2.8 2 4.6 4.7 4.6Z" />
  </>
);
const DropIcon = svg(<path d="M12 3.2s5.5 5.6 5.5 9.8a5.5 5.5 0 1 1-11 0c0-4.2 5.5-9.8 5.5-9.8Z" />);

const NAV: NavItem[] = [
  { label: "Home", href: "/home", icon: HomeIcon },
  { label: "Hold", href: "/portfolio", icon: WalletIcon },
  { label: "Card", href: "/cards", icon: CardIcon },
  { label: "Grow", href: "/grow", icon: SproutIcon },
  { label: "Pool", href: "/pool", icon: DropIcon },
];

export default function Sidebar() {
  const { logout, user, getAccessToken } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();
  const address = user?.wallet?.address;

  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!address) return;
    let off = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const [p, v] = await Promise.all([
          fetch(`/api/profile?address=${address}`).then((r) => r.json()),
          fetch(`/api/verify-worldid?address=${address}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }).then((r) => r.json()),
        ]);
        if (off) return;
        setName(p.profile?.name ?? null);
        setRole(p.profile?.role ?? null);
        setVerified(!!v.verified);
      } catch {
        /* chip degrades gracefully */
      }
    })();
    return () => {
      off = true;
    };
  }, [address, getAccessToken]);

  const isActive = (href: string) =>
    href.startsWith(pathname) && pathname !== "/";

  return (
    <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-line px-4 py-6 lg:flex">
      <div>
        <div className="mb-8 flex items-center gap-2 px-2">
          <Image src="/logo.png" alt="Flows" width={28} height={28} className="rounded-lg" />
          <span className="font-semibold">Flows</span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <button
              key={item.label}
              onClick={() => router.push(item.href)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive(item.href)
                  ? "bg-surface text-ink"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <item.icon
                className={`h-[18px] w-[18px] shrink-0 ${
                  isActive(item.href) ? "text-accent" : ""
                }`}
              />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <button
        onClick={logout}
        className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:bg-surface"
      >
        <span className="bg-ground border-line text-ink-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-medium">
          {name?.[0]?.toUpperCase() ?? "·"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{name ?? "Account"}</span>
          <span className="text-ink-soft block truncate text-xs">
            {verified ? "Verified" : "Unverified"}
            {role ? ` · ${role}` : ""}
          </span>
        </span>
        <span className="text-ink-soft text-xs">Log out</span>
      </button>
    </aside>
  );
}
