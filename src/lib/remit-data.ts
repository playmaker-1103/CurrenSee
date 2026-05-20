export type SourceCurrency = "EUR" | "GBP" | "USD";
export type TargetCurrency =
  | "VND"
  | "USD"
  | "GBP"
  | "EUR"
  | "INR"
  | "PHP"
  | "THB"
  | "CAD"
  | "AUD"
  | "JPY";
export type PaymentMethod = "Bank transfer" | "Debit card" | "Wallet balance";
export type ProviderKind = "Remittance app" | "Digital wallet" | "Irish bank";
export type QuoteSourceType =
  | "Live API"
  | "Cached adapter"
  | "Manual bank table"
  | "Partner access required";
export type ConfidenceLevel = "High" | "Medium" | "Low";

export type CurrencyPair = {
  sourceCurrency: SourceCurrency;
  targetCurrency: TargetCurrency;
  sendingCountry: string;
  receivingCountry: string;
  midMarketRate: number;
};

export type ProviderSeed = {
  id: string;
  name: string;
  kind: ProviderKind;
  url: string;
  color: string;
  rates: Record<string, number>;
  rateMultiplier: number;
  fixedFee: Record<SourceCurrency, number>;
  feePercent: number;
  deliveryLabel: string;
  deliveryMinutes: number;
  updatedMinutesAgo: number | null;
  sourceType: QuoteSourceType;
  confidence: ConfidenceLevel;
  reliabilityScore: number;
  paymentMethods: PaymentMethod[];
  notes: string;
};

export const sourceCurrencies: SourceCurrency[] = ["EUR", "GBP", "USD"];
export const targetCurrencies: TargetCurrency[] = [
  "VND",
  "INR",
  "PHP",
  "THB",
  "USD",
  "GBP",
  "EUR",
  "CAD",
  "AUD",
  "JPY",
];
export const paymentMethods: PaymentMethod[] = [
  "Bank transfer",
  "Debit card",
  "Wallet balance",
];

export const countryRoutes = [
  {
    sendingCountry: "Ireland",
    receivingCountry: "Vietnam",
  },
  {
    sendingCountry: "Ireland",
    receivingCountry: "India",
  },
  {
    sendingCountry: "Ireland",
    receivingCountry: "Philippines",
  },
  {
    sendingCountry: "Ireland",
    receivingCountry: "Thailand",
  },
  {
    sendingCountry: "Ireland",
    receivingCountry: "United States",
  },
  {
    sendingCountry: "Ireland",
    receivingCountry: "United Kingdom",
  },
  {
    sendingCountry: "United Kingdom",
    receivingCountry: "Vietnam",
  },
  {
    sendingCountry: "United States",
    receivingCountry: "Vietnam",
  },
] as const;

const benchmarkRates: Record<SourceCurrency, Record<TargetCurrency, number>> = {
  EUR: {
    VND: 30658,
    INR: 99.4,
    PHP: 68.5,
    THB: 37.7,
    USD: 1.16,
    GBP: 0.866,
    EUR: 1,
    CAD: 1.6,
    AUD: 1.78,
    JPY: 181.4,
  },
  GBP: {
    VND: 35395,
    INR: 114.8,
    PHP: 79.1,
    THB: 43.5,
    USD: 1.34,
    GBP: 1,
    EUR: 1.154,
    CAD: 1.85,
    AUD: 2.06,
    JPY: 209.5,
  },
  USD: {
    VND: 26430,
    INR: 85.7,
    PHP: 59.1,
    THB: 32.5,
    USD: 1,
    GBP: 0.746,
    EUR: 0.862,
    CAD: 1.38,
    AUD: 1.54,
    JPY: 156.4,
  },
};

const defaultReceivingCountryByCurrency: Record<TargetCurrency, string> = {
  VND: "Vietnam",
  INR: "India",
  PHP: "Philippines",
  THB: "Thailand",
  USD: "United States",
  GBP: "United Kingdom",
  EUR: "Eurozone",
  CAD: "Canada",
  AUD: "Australia",
  JPY: "Japan",
};

export const currencyPairs: CurrencyPair[] = sourceCurrencies.flatMap(
  (sourceCurrency) =>
    targetCurrencies
      .filter((targetCurrency) => targetCurrency !== sourceCurrency)
      .map((targetCurrency) => ({
        sourceCurrency,
        targetCurrency,
        sendingCountry:
          sourceCurrency === "GBP"
            ? "United Kingdom"
            : sourceCurrency === "USD"
              ? "United States"
              : "Ireland",
        receivingCountry: defaultReceivingCountryByCurrency[targetCurrency],
        midMarketRate: benchmarkRates[sourceCurrency][targetCurrency],
      })),
);

export function getAvailableTargetCurrencies(sourceCurrency: SourceCurrency) {
  return targetCurrencies.filter((currency) => currency !== sourceCurrency);
}

export function getDefaultTargetCurrency(sourceCurrency: SourceCurrency) {
  return getAvailableTargetCurrencies(sourceCurrency)[0];
}

export const providers: ProviderSeed[] = [
  {
    id: "wise",
    name: "Wise",
    kind: "Remittance app",
    url: "https://wise.com",
    color: "#2f8f5b",
    rates: {
      "EUR-VND": 28528,
      "GBP-VND": 33280,
      "USD-VND": 26012,
    },
    rateMultiplier: 0.996,
    fixedFee: {
      EUR: 4.5,
      GBP: 3.8,
      USD: 4.9,
    },
    feePercent: 0.002,
    deliveryLabel: "Within 1 hour",
    deliveryMinutes: 60,
    updatedMinutesAgo: 2,
    sourceType: "Cached adapter",
    confidence: "High",
    reliabilityScore: 94,
    paymentMethods: ["Bank transfer", "Debit card", "Wallet balance"],
    notes: "Transparent fee model with strong mid-market benchmarking.",
  },
  {
    id: "revolut",
    name: "Revolut",
    kind: "Digital wallet",
    url: "https://www.revolut.com",
    color: "#4f46e5",
    rates: {
      "EUR-VND": 28396,
      "GBP-VND": 33110,
      "USD-VND": 25895,
    },
    rateMultiplier: 0.992,
    fixedFee: {
      EUR: 0,
      GBP: 0,
      USD: 0,
    },
    feePercent: 0.0015,
    deliveryLabel: "Instant to same day",
    deliveryMinutes: 20,
    updatedMinutesAgo: 6,
    sourceType: "Cached adapter",
    confidence: "Medium",
    reliabilityScore: 88,
    paymentMethods: ["Wallet balance", "Debit card", "Bank transfer"],
    notes: "Good for speed, but effective pricing can change by plan and timing.",
  },
  {
    id: "remitly",
    name: "Remitly",
    kind: "Remittance app",
    url: "https://www.remitly.com",
    color: "#0f9f6e",
    rates: {
      "EUR-VND": 28610,
      "GBP-VND": 33370,
      "USD-VND": 26080,
    },
    rateMultiplier: 0.997,
    fixedFee: {
      EUR: 2.99,
      GBP: 2.49,
      USD: 3.99,
    },
    feePercent: 0.001,
    deliveryLabel: "Minutes",
    deliveryMinutes: 12,
    updatedMinutesAgo: 8,
    sourceType: "Partner access required",
    confidence: "High",
    reliabilityScore: 91,
    paymentMethods: ["Debit card", "Bank transfer"],
    notes: "Often competitive on promotional routes and fast cash-out corridors.",
  },
  {
    id: "taptapsend",
    name: "TaptapSend",
    kind: "Remittance app",
    url: "https://www.taptapsend.com",
    color: "#e1623f",
    rates: {
      "EUR-VND": 28585,
      "GBP-VND": 33315,
      "USD-VND": 26035,
    },
    rateMultiplier: 0.995,
    fixedFee: {
      EUR: 0,
      GBP: 0,
      USD: 0,
    },
    feePercent: 0.0025,
    deliveryLabel: "Minutes",
    deliveryMinutes: 15,
    updatedMinutesAgo: 4,
    sourceType: "Partner access required",
    confidence: "Medium",
    reliabilityScore: 86,
    paymentMethods: ["Debit card", "Bank transfer"],
    notes: "Simple payout experience with fee-light headline pricing.",
  },
  {
    id: "aib",
    name: "AIB",
    kind: "Irish bank",
    url: "https://aib.ie",
    color: "#7c3aed",
    rates: {
      "EUR-VND": 27980,
      "GBP-VND": 32610,
      "USD-VND": 25490,
    },
    rateMultiplier: 0.974,
    fixedFee: {
      EUR: 15,
      GBP: 12,
      USD: 16,
    },
    feePercent: 0.003,
    deliveryLabel: "1-3 business days",
    deliveryMinutes: 2880,
    updatedMinutesAgo: null,
    sourceType: "Manual bank table",
    confidence: "Low",
    reliabilityScore: 76,
    paymentMethods: ["Bank transfer"],
    notes: "Useful benchmark for traditional bank cost comparison.",
  },
  {
    id: "bank-of-ireland",
    name: "Bank of Ireland",
    kind: "Irish bank",
    url: "https://www.bankofireland.com",
    color: "#0f766e",
    rates: {
      "EUR-VND": 27895,
      "GBP-VND": 32520,
      "USD-VND": 25435,
    },
    rateMultiplier: 0.969,
    fixedFee: {
      EUR: 18,
      GBP: 14,
      USD: 18,
    },
    feePercent: 0.0032,
    deliveryLabel: "1-3 business days",
    deliveryMinutes: 2880,
    updatedMinutesAgo: null,
    sourceType: "Manual bank table",
    confidence: "Low",
    reliabilityScore: 73,
    paymentMethods: ["Bank transfer"],
    notes: "Traditional bank option with slower settlement and wider FX spread.",
  },
  {
    id: "permanent-tsb",
    name: "Permanent TSB",
    kind: "Irish bank",
    url: "https://www.ptsb.ie",
    color: "#b45309",
    rates: {
      "EUR-VND": 28020,
      "GBP-VND": 32645,
      "USD-VND": 25510,
    },
    rateMultiplier: 0.972,
    fixedFee: {
      EUR: 17,
      GBP: 13,
      USD: 17,
    },
    feePercent: 0.003,
    deliveryLabel: "1-3 business days",
    deliveryMinutes: 2880,
    updatedMinutesAgo: null,
    sourceType: "Manual bank table",
    confidence: "Low",
    reliabilityScore: 74,
    paymentMethods: ["Bank transfer"],
    notes: "Included to compare remittance apps against Irish bank rails.",
  },
];

export const rateHistory = [
  { label: "Mon", mid: 28390, wise: 28282, remitly: 28355, revolut: 28190 },
  { label: "Tue", mid: 28480, wise: 28358, remitly: 28440, revolut: 28285 },
  { label: "Wed", mid: 28520, wise: 28412, remitly: 28488, revolut: 28330 },
  { label: "Thu", mid: 28585, wise: 28476, remitly: 28545, revolut: 28385 },
  { label: "Fri", mid: 28640, wise: 28528, remitly: 28610, revolut: 28190 },
];
