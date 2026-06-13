export type CardKind = "intl" | "us";

export type NormalizedCardTransaction = {
  amount: number | null;
  date: string | null;
  description: string | null;
  isCredit: boolean | null;
};

export type NormalizedLasoCard = {
  id: string;
  type: CardKind;
  label?: string;
  status?: string;
  cardNumber?: string;
  expMonth?: string;
  expYear?: string;
  expiry?: string;
  cvv?: string;
  balance?: string | number;
  amount?: number | null;
  transactions: NormalizedCardTransaction[];
  archived?: boolean;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pick(obj: unknown, keys: string[]) {
  if (!isRecord(obj)) return undefined;
  for (const key of keys) {
    if (obj[key] != null) return obj[key];
  }
  return undefined;
}

function asString(value: unknown) {
  if (value == null) return undefined;
  return String(value);
}

function asFiniteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nestedRecord(obj: unknown, key: string) {
  const value = isRecord(obj) ? obj[key] : undefined;
  return isRecord(value) ? value : undefined;
}

function mergeRecords(...records: (JsonRecord | undefined)[]) {
  return records.reduce<JsonRecord>(
    (merged, record) => (record ? { ...merged, ...record } : merged),
    {}
  );
}

function looksLikeCard(obj: JsonRecord) {
  const strongKeys = [
    "card_id",
    "queued_order_card_id",
    "id",
    "card_details",
    "card_number",
    "cardNumber",
    "pan",
    "number",
    "transactions",
  ];
  if (strongKeys.some((key) => obj[key] != null)) return true;

  const hasCardishStatus = obj.status != null || obj.state != null;
  return (
    hasCardishStatus &&
    ["usd_amount", "amount", "available_balance", "balance", "card_type"].some(
      (key) => obj[key] != null
    )
  );
}

export function extractCards(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(extractCards);
  if (!isRecord(value)) return [];

  const baseCard = nestedRecord(value, "card");
  if (baseCard && Array.isArray(value.card_data)) {
    const nestedCards = extractCards(value.card_data);
    if (nestedCards.length) {
      return nestedCards.map((card) =>
        mergeRecords(baseCard, isRecord(card) ? card : undefined)
      );
    }
  }

  const mergedCard = mergeRecords(
    baseCard,
    nestedRecord(value, "card_data")
  );
  if (Object.keys(mergedCard).length && looksLikeCard(mergedCard)) {
    return [mergedCard];
  }

  if (looksLikeCard(value)) return [value];

  for (const key of ["cards", "card_data", "data", "items", "result", "results"]) {
    const nested = extractCards(value[key]);
    if (nested.length) return nested;
  }

  return [];
}

export function hasUsableCardDetails(cardData: unknown) {
  const details =
    nestedRecord(cardData, "card_details") ??
    nestedRecord(nestedRecord(cardData, "card_data"), "card_details") ??
    cardData;

  return Boolean(
    pick(details, ["card_number", "cardNumber", "pan", "number"]) &&
      pick(details, ["exp_month", "expMonth", "expiration_month"]) &&
      pick(details, ["exp_year", "expYear", "expiration_year"]) &&
      pick(details, ["cvv", "cvc", "security_code"])
  );
}

export function normalizeCardTransactions(cardData: unknown) {
  const transactions =
    (Array.isArray(pick(cardData, ["transactions"]))
      ? pick(cardData, ["transactions"])
      : undefined) ??
    (Array.isArray(pick(nestedRecord(cardData, "card_data"), ["transactions"]))
      ? pick(nestedRecord(cardData, "card_data"), ["transactions"])
      : undefined) ??
    [];

  return (transactions as unknown[]).map((txn) => {
    const record = isRecord(txn) ? txn : {};
    const amount = asFiniteNumber(
      pick(record, ["amount", "usd_amount", "value"])
    );
    const isCreditRaw = pick(record, ["is_credit", "isCredit"]);
    return {
      amount,
      date: asString(pick(record, ["date", "created_at", "createdAt", "time"])) ?? null,
      description:
        asString(
          pick(record, ["description", "merchant", "merchant_name", "name"])
        ) ?? null,
      isCredit: typeof isCreditRaw === "boolean" ? isCreditRaw : null,
    };
  });
}

export function normalizeLasoCards(
  value: unknown,
  type: CardKind,
  archivedIds: ReadonlySet<string> = new Set()
): NormalizedLasoCard[] {
  return extractCards(value).map((card, index) => {
    const cardData = mergeRecords(
      isRecord(card) ? card : undefined,
      nestedRecord(card, "card_data")
    );
    const details = mergeRecords(
      nestedRecord(cardData, "card_details"),
      cardData
    );

    const cardNumber = asString(
      pick(details, ["card_number", "cardNumber", "pan", "number"])
    );
    const expMonth = asString(
      pick(details, ["exp_month", "expMonth", "expiration_month"])
    );
    const expYear = asString(
      pick(details, ["exp_year", "expYear", "expiration_year"])
    );
    const cvv = asString(pick(details, ["cvv", "cvc", "security_code"]));
    const amount = asFiniteNumber(
      pick(cardData, ["usd_amount", "amount", "initial_balance"])
    );
    const rawBalance = pick(details, [
      "available_balance",
      "availableBalance",
      "balance",
    ]);
    const balance =
      typeof rawBalance === "number" || typeof rawBalance === "string"
        ? rawBalance
        : (amount ?? undefined);
    const id =
      asString(
        pick(cardData, ["card_id", "queued_order_card_id", "id", "cardId"])
      ) ??
      [
        type,
        cardNumber ? cardNumber.replace(/\s/g, "").slice(-4) : undefined,
        expMonth,
        expYear,
        amount ?? undefined,
        index,
      ]
        .filter((part) => part != null && part !== "")
        .join("-");

    return {
      id,
      type,
      label: asString(pick(cardData, ["label", "name"])),
      status: asString(pick(cardData, ["status", "state"])),
      cardNumber,
      expMonth,
      expYear,
      expiry:
        asString(pick(cardData, ["expiry", "expiration", "exp"])) ??
        (expMonth && expYear ? `${expMonth}/${expYear}` : undefined),
      cvv,
      balance,
      amount,
      transactions: normalizeCardTransactions(cardData),
      archived: archivedIds.has(id),
    };
  });
}
