import {
  currencyPairs,
  type CurrencyPair,
  type PaymentMethod,
  type ProviderSeed,
  type SourceCurrency,
  type TargetCurrency,
} from "./remit-data";

export type QuoteRequest = {
  amount: number;
  sourceCurrency: SourceCurrency;
  targetCurrency: TargetCurrency;
  sendingCountry: string;
  receivingCountry: string;
  paymentMethod: PaymentMethod;
};

export type CalculatedQuote = {
  provider: ProviderSeed;
  rate: number;
  midMarketRate: number;
  feeAmount: number;
  amountConverted: number;
  recipientAmount: number;
  effectiveRate: number;
  spreadPercent: number;
  hiddenCostSource: number;
  freshnessLabel: string;
  freshnessStatus: "Fresh" | "Cached" | "Manual";
  score: number;
  rank: number;
  badge: string;
  savingsVsWorst: number;
};

export type ProviderQuoteInput = {
  provider: ProviderSeed;
  rate: number;
  midMarketRate: number;
  feeAmount: number;
  amountConverted: number;
  recipientAmount: number;
};

const paymentMethodFeeAdjustments: Record<PaymentMethod, number> = {
  "Bank transfer": 0,
  "Debit card": 0.0035,
  "Wallet balance": 0.001,
};

const zeroDecimalCurrencies = new Set<SourceCurrency | TargetCurrency>([
  "VND",
  "JPY",
]);

export function pairKey(
  sourceCurrency: SourceCurrency,
  targetCurrency: TargetCurrency,
) {
  return `${sourceCurrency}-${targetCurrency}`;
}

export function findCurrencyPair(request: QuoteRequest): CurrencyPair {
  return (
    currencyPairs.find(
      (pair) =>
        pair.sourceCurrency === request.sourceCurrency &&
        pair.targetCurrency === request.targetCurrency,
    ) ?? currencyPairs[0]
  );
}

export function formatCurrency(
  value: number,
  currency: SourceCurrency | TargetCurrency,
  compact = false,
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: zeroDecimalCurrencies.has(currency) || compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function formatRate(rate: number, targetCurrency: TargetCurrency) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: zeroDecimalCurrencies.has(targetCurrency) ? 0 : 4,
  }).format(rate)} ${targetCurrency}`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function getFreshness(provider: ProviderSeed) {
  if (provider.updatedMinutesAgo === null) {
    return {
      label: "Manual table",
      status: "Manual" as const,
      score: 0.55,
    };
  }

  if (provider.updatedMinutesAgo <= 10) {
    return {
      label:
        provider.updatedMinutesAgo <= 1
          ? "Just now"
          : `${provider.updatedMinutesAgo} min ago`,
      status: "Fresh" as const,
      score: 1,
    };
  }

  return {
    label: `${provider.updatedMinutesAgo} min ago`,
    status: "Cached" as const,
    score: 0.75,
  };
}

export function getStaticQuoteInput(
  provider: ProviderSeed,
  request: QuoteRequest,
): ProviderQuoteInput {
  const key = pairKey(request.sourceCurrency, request.targetCurrency);
  const pair = findCurrencyPair(request);
  const rate = provider.rates[key] ?? pair.midMarketRate * provider.rateMultiplier;
  const methodAdjustment = provider.paymentMethods.includes(request.paymentMethod)
    ? paymentMethodFeeAdjustments[request.paymentMethod]
    : 0.006;
  const fixedFee = provider.fixedFee[request.sourceCurrency];
  const feeAmount =
    fixedFee + request.amount * (provider.feePercent + methodAdjustment);
  const amountConverted = Math.max(request.amount - feeAmount, 0);
  const recipientAmount = amountConverted * rate;

  return {
    provider,
    rate,
    midMarketRate: pair.midMarketRate,
    feeAmount,
    amountConverted,
    recipientAmount,
  };
}

export function rankProviderQuotes(
  quoteInputs: ProviderQuoteInput[],
  sourceAmount: number,
): CalculatedQuote[] {
  const quotes = quoteInputs.map((quote) => {
    const freshness = getFreshness(quote.provider);
    const effectiveRate =
      sourceAmount > 0 ? quote.recipientAmount / sourceAmount : 0;
    const spreadPercent =
      quote.midMarketRate > 0
        ? ((quote.midMarketRate - quote.rate) / quote.midMarketRate) * 100
        : 0;
    const midMarketRecipient = sourceAmount * quote.midMarketRate;
    const hiddenCostSource =
      quote.midMarketRate > 0
        ? Math.max(midMarketRecipient - quote.recipientAmount, 0) /
          quote.midMarketRate
        : 0;

    return {
      ...quote,
      effectiveRate,
      spreadPercent,
      hiddenCostSource,
      freshnessLabel: freshness.label,
      freshnessStatus: freshness.status,
      freshnessScore: freshness.score,
    };
  });
  const recipientAmounts = quotes.map((quote) => quote.recipientAmount);
  const fees = quotes.map((quote) => quote.feeAmount);
  const fastestDelivery = Math.min(
    ...quotes.map((quote) => quote.provider.deliveryMinutes),
  );
  const slowestDelivery = Math.max(
    ...quotes.map((quote) => quote.provider.deliveryMinutes),
  );
  const maxRecipientAmount = Math.max(...recipientAmounts);
  const minRecipientAmount = Math.min(...recipientAmounts);
  const maxFee = Math.max(...fees);
  const minFee = Math.min(...fees);
  const worstRecipientAmount = minRecipientAmount;
  const rangeOrOne = (maxRecipientAmount - minRecipientAmount || 1);
  const feeRangeOrOne = (maxFee - minFee || 1);
  const deliveryRangeOrOne = (slowestDelivery - fastestDelivery || 1);

  return quotes
    .map((quote) => {
      const recipientScore =
        (quote.recipientAmount - minRecipientAmount) / rangeOrOne;
      const feeScore = 1 - (quote.feeAmount - minFee) / feeRangeOrOne;
      const speedScore =
        1 -
        (quote.provider.deliveryMinutes - fastestDelivery) / deliveryRangeOrOne;
      const reliabilityScore = quote.provider.reliabilityScore / 100;
      const score =
        recipientScore * 0.45 +
        feeScore * 0.2 +
        speedScore * 0.15 +
        quote.freshnessScore * 0.1 +
        reliabilityScore * 0.1;

      return {
        ...quote,
        score: Math.round(score * 100),
        rank: 0,
        badge: "",
        savingsVsWorst: quote.recipientAmount - worstRecipientAmount,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((quote, index, sortedQuotes) => {
      const highestPayout = Math.max(
        ...sortedQuotes.map((item) => item.recipientAmount),
      );
      const lowestFee = Math.min(...sortedQuotes.map((item) => item.feeAmount));
      const fastest = Math.min(
        ...sortedQuotes.map((item) => item.provider.deliveryMinutes),
      );
      let badge = index === 0 ? "Best overall" : "";

      if (!badge && quote.recipientAmount === highestPayout) {
        badge = "Highest payout";
      }

      if (!badge && quote.feeAmount === lowestFee) {
        badge = "Lowest fee";
      }

      if (!badge && quote.provider.deliveryMinutes === fastest) {
        badge = "Fastest";
      }

      if (!badge && quote.provider.kind === "Irish bank") {
        badge = "Bank option";
      }

      return {
        ...quote,
        rank: index + 1,
        badge,
      };
    });
}

export function rankQuotes(
  providers: ProviderSeed[],
  request: QuoteRequest,
): CalculatedQuote[] {
  return rankProviderQuotes(
    providers.map((provider) => getStaticQuoteInput(provider, request)),
    request.amount,
  );
}
