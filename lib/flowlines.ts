import { getStore } from "./store";

// A user can "start" a FlowLine with a counterparty before any history exists.
// The declared line is stored so it shows up immediately; its LineScore then
// grows from the actual remittance.received events (computeFlowLines).
export type DeclaredLine = {
  id: string; // `${owner}->${counterparty}`
  owner: string;
  counterparty: string;
  counterpartyName?: string;
  counterpartyCountry?: string;
  role: "sender" | "receiver"; // owner's side of the line
  created_at: string;
};

const listKey = (owner: string) => `flines:${owner.toLowerCase()}`;

export async function listDeclaredLines(owner: string): Promise<DeclaredLine[]> {
  return (await getStore().get<DeclaredLine[]>(listKey(owner))) ?? [];
}

export async function createDeclaredLine(
  line: Omit<DeclaredLine, "id" | "created_at">
): Promise<DeclaredLine> {
  const store = getStore();
  const owner = line.owner.toLowerCase();
  const counterparty = line.counterparty.toLowerCase();
  const id = `${owner}->${counterparty}`;
  const existing = await listDeclaredLines(owner);
  const found = existing.find((l) => l.id === id);
  if (found) return found;
  const declared: DeclaredLine = {
    ...line,
    owner,
    counterparty,
    id,
    created_at: new Date().toISOString(),
  };
  await store.set(listKey(owner), [declared, ...existing].slice(0, 100));
  return declared;
}
