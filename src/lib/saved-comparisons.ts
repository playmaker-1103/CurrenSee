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
