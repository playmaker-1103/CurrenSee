import type {
  CalculatedQuote,
  QuoteRequest,
} from "./remit-calculations";

export type QuoteSourceSummary = {
  live: number;
  fallback: number;
};

export type QuoteHistoryItem = QuoteRequest & {
  id: string;
  bestProviderId: string;
  bestProviderName: string;
  recipientAmount: number;
  feeAmount: number;
  rate: number;
  savedAt: string;
  sourceSummary: QuoteSourceSummary;
};

export type WatchlistRule = Pick<
  QuoteRequest,
  | "sourceCurrency"
  | "targetCurrency"
  | "sendingCountry"
  | "receivingCountry"
  | "paymentMethod"
> & {
  id: string;
  providerName: string;
  targetRate: number;
  createdAt: string;
  status: "Watching";
};

export type QuoteSnapshot = QuoteRequest & {
  id: string;
  providerId: string;
  providerName: string;
  providerSourceType: string;
  rate: number;
  recipientAmount: number;
  feeAmount: number;
  benchmarkRate: number;
  capturedAt: string;
  sourceSummary: QuoteSourceSummary;
};

const zeroDecimalTargets = new Set(["VND", "JPY"]);

function comparisonSignature(
  item: Pick<
    QuoteRequest,
    | "amount"
    | "sourceCurrency"
    | "targetCurrency"
    | "sendingCountry"
    | "receivingCountry"
    | "paymentMethod"
  >,
) {
  return [
    item.amount,
    item.sourceCurrency,
    item.targetCurrency,
    item.sendingCountry,
    item.receivingCountry,
    item.paymentMethod,
  ].join(":");
}

function snapshotSignature(snapshot: QuoteSnapshot) {
  return [
    snapshot.providerId,
    snapshot.sourceCurrency,
    snapshot.targetCurrency,
    snapshot.paymentMethod,
    snapshot.capturedAt,
  ].join(":");
}

export function createQuoteHistoryItem(
  request: QuoteRequest,
  bestQuote: CalculatedQuote,
  sourceSummary: QuoteSourceSummary,
  savedAt = new Date().toISOString(),
): QuoteHistoryItem {
  return {
    ...request,
    id: `${comparisonSignature(request)}:${savedAt}`,
    bestProviderId: bestQuote.provider.id,
    bestProviderName: bestQuote.provider.name,
    recipientAmount: bestQuote.recipientAmount,
    feeAmount: bestQuote.feeAmount,
    rate: bestQuote.rate,
    savedAt,
    sourceSummary,
  };
}

export function upsertQuoteHistory(
  history: QuoteHistoryItem[],
  item: QuoteHistoryItem,
  limit = 6,
) {
  const itemSignature = comparisonSignature(item);
  const next = [
    item,
    ...history.filter(
      (historyItem) => comparisonSignature(historyItem) !== itemSignature,
    ),
  ];

  return next
    .sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )
    .slice(0, limit);
}

export function createQuoteSnapshots(
  request: QuoteRequest,
  quotes: CalculatedQuote[],
  benchmarkRate: number,
  sourceSummary: QuoteSourceSummary,
  capturedAt = new Date().toISOString(),
): QuoteSnapshot[] {
  return quotes.map((quote) => ({
    ...request,
    id: [
      quote.provider.id,
      request.sourceCurrency,
      request.targetCurrency,
      request.paymentMethod,
      capturedAt,
    ].join(":"),
    providerId: quote.provider.id,
    providerName: quote.provider.name,
    providerSourceType: quote.provider.sourceType,
    rate: quote.rate,
    recipientAmount: quote.recipientAmount,
    feeAmount: quote.feeAmount,
    benchmarkRate,
    capturedAt,
    sourceSummary,
  }));
}

export function upsertQuoteSnapshots(
  snapshots: QuoteSnapshot[],
  nextSnapshots: QuoteSnapshot[],
  limit = 96,
) {
  const seen = new Set<string>();

  return [...nextSnapshots, ...snapshots]
    .filter((snapshot) => {
      const signature = snapshotSignature(snapshot);

      if (seen.has(signature)) {
        return false;
      }

      seen.add(signature);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
    )
    .slice(0, limit);
}

export function getProviderTrendSnapshots(
  snapshots: QuoteSnapshot[],
  request: Pick<
    QuoteRequest,
    "sourceCurrency" | "targetCurrency" | "paymentMethod"
  >,
  providerId: string,
  limit = 8,
) {
  return snapshots
    .filter(
      (snapshot) =>
        snapshot.providerId === providerId &&
        snapshot.sourceCurrency === request.sourceCurrency &&
        snapshot.targetCurrency === request.targetCurrency &&
        snapshot.paymentMethod === request.paymentMethod,
    )
    .sort(
      (a, b) =>
        new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    )
    .slice(-limit);
}

export function createWatchlistRule(
  request: QuoteRequest,
  bestQuote: CalculatedQuote,
  createdAt = new Date().toISOString(),
): WatchlistRule {
  const targetRate = Number(
    (bestQuote.rate * 1.005).toFixed(
      zeroDecimalTargets.has(request.targetCurrency) ? 0 : 4,
    ),
  );

  return {
    id: `${comparisonSignature(request)}:${createdAt}`,
    sourceCurrency: request.sourceCurrency,
    targetCurrency: request.targetCurrency,
    sendingCountry: request.sendingCountry,
    receivingCountry: request.receivingCountry,
    paymentMethod: request.paymentMethod,
    providerName: bestQuote.provider.name,
    targetRate,
    createdAt,
    status: "Watching",
  };
}

export function upsertWatchlist(
  rules: WatchlistRule[],
  rule: WatchlistRule,
  limit = 6,
) {
  const ruleSignature = [
    rule.sourceCurrency,
    rule.targetCurrency,
    rule.sendingCountry,
    rule.receivingCountry,
    rule.paymentMethod,
    rule.providerName,
  ].join(":");
  const next = [
    rule,
    ...rules.filter(
      (currentRule) =>
        [
          currentRule.sourceCurrency,
          currentRule.targetCurrency,
          currentRule.sendingCountry,
          currentRule.receivingCountry,
          currentRule.paymentMethod,
          currentRule.providerName,
        ].join(":") !== ruleSignature,
    ),
  ];

  return next
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}
