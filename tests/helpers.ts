import type { StoredEvent } from "../lib/events";

export const SENDER = "0x" + "a".repeat(40);
export const RECEIVER = "0x" + "b".repeat(40);
const DAY = 86_400_000;

export const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

let seq = 0;
export function ev(e: Partial<StoredEvent> & { type: string }): StoredEvent {
  return {
    id: seq++,
    created_at: e.created_at ?? ago(0),
    address: e.address,
    amount_usd: e.amount_usd,
    payload: e.payload ?? {},
    ...e,
  } as StoredEvent;
}

/** A sender → receiver remittance (the event analytics/flowlines key on). */
export function received(
  amount: number,
  daysAgo: number,
  opts: { sender?: string; receiver?: string; scheduled?: boolean } = {}
): StoredEvent {
  const sender = opts.sender ?? SENDER;
  const receiver = opts.receiver ?? RECEIVER;
  return ev({
    type: "remittance.received",
    address: receiver,
    amount_usd: amount,
    created_at: ago(daysAgo),
    payload: {
      from: sender,
      from_country: "US",
      from_name: "Alice",
      scheduled: opts.scheduled === true,
    },
  });
}
