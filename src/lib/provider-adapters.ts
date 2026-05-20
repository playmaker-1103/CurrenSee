import "server-only";

import {
  paymentMethods,
  providers,
  sourceCurrencies,
  targetCurrencies,
  getDefaultTargetCurrency,
  type PaymentMethod,
  type ProviderSeed,
  type SourceCurrency,
  type TargetCurrency,
} from "./remit-data";
import {
  findCurrencyPair,
  getStaticQuoteInput,
  rankProviderQuotes,
  type ProviderQuoteInput,
  type QuoteRequest,
} from "./remit-calculations";
import type { QuoteApiResponse } from "./quote-api";

type AdapterResult = {
  quote: ProviderQuoteInput;
  live: boolean;
  error?: string;
};

type WisePaymentOption = {
  payIn?: string;
  fee?: {
    total?: number;
  };
  price?: {
    total?: {
      value?: {
        amount?: number;
      };
    };
    calculatedOn?: {
      unroundedAmountToConvert?: {
        amount?: number;
      };
    };
  };
  sourceAmount?: number;
  targetAmount?: number;
  formattedEstimatedDelivery?: string;
  estimatedDelivery?: string;
  disabled?: boolean;
};

type WiseQuoteResponse = {
  rate?: number;
  rateTimestamp?: string;
  createdTime?: string;
  paymentOptions?: WisePaymentOption[];
};

type RevolutRateResponse = {
  from?: {
    amount?: number;
    currency?: string;
  };
  to?: {
    amount?: number;
    currency?: string;
  };
  rate?: number;
  fee?: {
    amount?: number;
    currency?: string;
  };
  rate_date?: string;
};

const providerById = new Map(providers.map((provider) => [provider.id, provider]));

function getProvider(id: string) {
  const provider = providerById.get(id);

  if (!provider) {
    throw new Error(`Missing provider seed: ${id}`);
  }

  return provider;
}

function minutesSince(dateText?: string) {
  if (!dateText) {
    return 0;
  }

  const timestamp = new Date(dateText).getTime();

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
}

function minutesUntil(dateText?: string, fallback: number = 60) {
  if (!dateText) {
    return fallback;
  }

  const timestamp = new Date(dateText).getTime();

  if (Number.isNaN(timestamp)) {
    return fallback;
  }

  return Math.max(1, Math.round((timestamp - Date.now()) / 60000));
}

function cloneProvider(
  provider: ProviderSeed,
  overrides: Partial<ProviderSeed>,
): ProviderSeed {
  return {
    ...provider,
    ...overrides,
    fixedFee: {
      ...provider.fixedFee,
      ...overrides.fixedFee,
    },
    rates: {
      ...provider.rates,
      ...overrides.rates,
    },
  };
}

function fallbackQuote(
  providerId: string,
  request: QuoteRequest,
  overrides: Partial<ProviderSeed> = {},
): ProviderQuoteInput {
  return getStaticQuoteInput(
    cloneProvider(getProvider(providerId), overrides),
    request,
  );
}

function payInForWise(paymentMethod: PaymentMethod) {
  if (paymentMethod === "Debit card") {
    return "DEBIT";
  }

  if (paymentMethod === "Wallet balance") {
    return "BALANCE";
  }

  return "BANK_TRANSFER";
}

function chooseWiseOption(
  options: WisePaymentOption[],
  paymentMethod: PaymentMethod,
) {
  const enabledOptions = options.filter((option) => !option.disabled);
  const preferredPayIn = payInForWise(paymentMethod);

  return (
    enabledOptions.find((option) => option.payIn === preferredPayIn) ??
    enabledOptions.find((option) => option.payIn === "BANK_TRANSFER") ??
    enabledOptions[0]
  );
}

async function getWiseQuote(request: QuoteRequest): Promise<AdapterResult> {
  const provider = getProvider("wise");

  try {
    const response = await fetch("https://api.wise.com/v3/quotes/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceCurrency: request.sourceCurrency,
        targetCurrency: request.targetCurrency,
        sourceAmount: request.amount,
        targetAmount: null,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Wise returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as WiseQuoteResponse;
    const option = chooseWiseOption(data.paymentOptions ?? [], request.paymentMethod);

    if (!option || !data.rate || !option.targetAmount) {
      throw new Error("Wise response did not include a usable payment option");
    }

    const feeAmount =
      option.fee?.total ?? option.price?.total?.value?.amount ?? 0;
    const amountConverted =
      option.price?.calculatedOn?.unroundedAmountToConvert?.amount ??
      Math.max(request.amount - feeAmount, 0);
    const fetchedAt = data.rateTimestamp ?? data.createdTime;
    const liveProvider = cloneProvider(provider, {
      sourceType: "Live API",
      confidence: "High",
      updatedMinutesAgo: minutesSince(fetchedAt),
      deliveryLabel: option.formattedEstimatedDelivery ?? provider.deliveryLabel,
      deliveryMinutes: minutesUntil(
        option.estimatedDelivery,
        provider.deliveryMinutes,
      ),
      notes:
        "Live Wise quote using the unauthenticated Wise Platform quote endpoint.",
    });

    return {
      live: true,
      quote: {
        provider: liveProvider,
        rate: data.rate,
        midMarketRate: data.rate,
        feeAmount,
        amountConverted,
        recipientAmount: option.targetAmount,
      },
    };
  } catch (error) {
    return {
      live: false,
      error: error instanceof Error ? error.message : "Wise quote failed",
      quote: fallbackQuote("wise", request, {
        sourceType: "Cached adapter",
        confidence: "Medium",
        notes:
          "Wise live quote was unavailable, so this row is using the cached corridor model.",
      }),
    };
  }
}

async function getRevolutQuote(request: QuoteRequest): Promise<AdapterResult> {
  const provider = getProvider("revolut");
  const token = process.env.REVOLUT_BUSINESS_API_TOKEN;

  if (!token) {
    return {
      live: false,
      error: "REVOLUT_BUSINESS_API_TOKEN is not configured",
      quote: fallbackQuote("revolut", request, {
        sourceType: "Cached adapter",
        confidence: "Medium",
        notes:
          "Set REVOLUT_BUSINESS_API_TOKEN to enable the live Revolut Business rate adapter.",
      }),
    };
  }

  try {
    const baseUrl =
      process.env.REVOLUT_API_BASE_URL ?? "https://b2b.revolut.com/api/1.0";
    const url = new URL(`${baseUrl}/rate`);
    url.searchParams.set("from", request.sourceCurrency);
    url.searchParams.set("to", request.targetCurrency);
    url.searchParams.set("amount", String(request.amount));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Revolut returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as RevolutRateResponse;
    const rate = Number(data.rate);
    const recipientAmount = Number(data.to?.amount);
    const feeAmount =
      data.fee?.currency === request.sourceCurrency
        ? Number(data.fee.amount ?? 0)
        : 0;

    if (!rate || !recipientAmount) {
      throw new Error("Revolut response did not include a usable quote");
    }

    const liveProvider = cloneProvider(provider, {
      sourceType: "Live API",
      confidence: "High",
      updatedMinutesAgo: minutesSince(data.rate_date),
      notes: "Live Revolut Business API exchange-rate quote.",
    });

    return {
      live: true,
      quote: {
        provider: liveProvider,
        rate,
        midMarketRate: findCurrencyPair(request).midMarketRate,
        feeAmount,
        amountConverted: Math.max(request.amount - feeAmount, 0),
        recipientAmount,
      },
    };
  } catch (error) {
    return {
      live: false,
      error: error instanceof Error ? error.message : "Revolut quote failed",
      quote: fallbackQuote("revolut", request, {
        sourceType: "Cached adapter",
        confidence: "Medium",
        notes:
          "Revolut live quote failed, so this row is using the cached corridor model.",
      }),
    };
  }
}

function getPartnerAccessFallbackQuote(
  providerId: "remitly" | "taptapsend",
  request: QuoteRequest,
): AdapterResult {
  return {
    live: false,
    error: `${getProvider(providerId).name} public quote API is not configured`,
    quote: fallbackQuote(providerId, request, {
      sourceType: "Partner access required",
      confidence: "Medium",
      updatedMinutesAgo: null,
      notes:
        "Public self-serve quote API access is not available yet; this row uses a cached corridor model.",
    }),
  };
}

function getManualBankQuote(
  providerId: "aib" | "bank-of-ireland" | "permanent-tsb",
  request: QuoteRequest,
): AdapterResult {
  return {
    live: false,
    quote: fallbackQuote(providerId, request, {
      sourceType: "Manual bank table",
      confidence: "Low",
      updatedMinutesAgo: null,
    }),
  };
}

function normalizeBenchmark(
  results: AdapterResult[],
  request: QuoteRequest,
): ProviderQuoteInput[] {
  const wiseQuote = results.find(
    (result) => result.quote.provider.id === "wise" && result.live,
  )?.quote;
  const benchmarkRate = wiseQuote?.midMarketRate ?? findCurrencyPair(request).midMarketRate;

  return results.map((result) => ({
    ...result.quote,
    midMarketRate: benchmarkRate,
  }));
}

export function parseQuoteRequest(searchParams: URLSearchParams): QuoteRequest {
  const amount = Math.max(Number(searchParams.get("amount") ?? 1000), 0);
  const sourceCurrency = searchParams.get("sourceCurrency") as SourceCurrency;
  const requestedTargetCurrency = searchParams.get("targetCurrency") as TargetCurrency;
  const paymentMethod = searchParams.get("paymentMethod") as PaymentMethod;
  const normalizedSourceCurrency = sourceCurrencies.includes(sourceCurrency)
    ? sourceCurrency
    : "EUR";
  const normalizedTargetCurrency =
    targetCurrencies.includes(requestedTargetCurrency) &&
    requestedTargetCurrency !== normalizedSourceCurrency
      ? requestedTargetCurrency
      : getDefaultTargetCurrency(normalizedSourceCurrency);

  return {
    amount,
    sourceCurrency: normalizedSourceCurrency,
    targetCurrency: normalizedTargetCurrency,
    sendingCountry: searchParams.get("sendingCountry") ?? "Ireland",
    receivingCountry: searchParams.get("receivingCountry") ?? "Vietnam",
    paymentMethod: paymentMethods.includes(paymentMethod)
      ? paymentMethod
      : "Bank transfer",
  };
}

export async function getComparisonQuotes(
  request: QuoteRequest,
): Promise<QuoteApiResponse> {
  const results = await Promise.all([
    getWiseQuote(request),
    getRevolutQuote(request),
    Promise.resolve(getPartnerAccessFallbackQuote("remitly", request)),
    Promise.resolve(getPartnerAccessFallbackQuote("taptapsend", request)),
    Promise.resolve(getManualBankQuote("aib", request)),
    Promise.resolve(getManualBankQuote("bank-of-ireland", request)),
    Promise.resolve(getManualBankQuote("permanent-tsb", request)),
  ]);
  const normalizedQuotes = normalizeBenchmark(results, request);
  const benchmarkRate = normalizedQuotes[0]?.midMarketRate ?? findCurrencyPair(request).midMarketRate;

  return {
    request,
    quotes: rankProviderQuotes(normalizedQuotes, request.amount),
    benchmarkRate,
    fetchedAt: new Date().toISOString(),
    sourceSummary: {
      live: results.filter((result) => result.live).length,
      fallback: results.filter((result) => !result.live).length,
      errors: results
        .map((result) => result.error)
        .filter((error): error is string => Boolean(error)),
    },
  };
}
