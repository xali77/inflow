"use client";

import { useMemo, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/countries";

export default function CountrySelect({
  value,
  onChange,
}: {
  value: string; // ISO code, or "" when unset
  onChange: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = COUNTRIES.find((c) => c.code === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [query]);

  const pick = (code: string) => {
    onChange(code);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        value={open ? query : selected?.name ?? ""}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          // Delay so an option click registers before the list closes.
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        placeholder="Search your country"
        className="w-full rounded-xl border border-line bg-ground px-4 py-3 text-ink placeholder:text-ink-soft/60 focus:outline-none"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1">
          {matches.length === 0 ? (
            <li className="px-4 py-2 text-sm text-ink-soft">No matches</li>
          ) : (
            matches.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent input blur from firing before the click.
                    e.preventDefault();
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    pick(c.code);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-ground ${
                    c.code === value ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-ink-soft/60 text-xs">{c.code}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
