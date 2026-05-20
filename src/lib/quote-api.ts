import type { CalculatedQuote, QuoteRequest } from "./remit-calculations";

export type QuoteApiResponse = {
  request: QuoteRequest;
  quotes: CalculatedQuote[];
  benchmarkRate: number;
  fetchedAt: string;
  sourceSummary: {
    live: number;
    fallback: number;
    errors: string[];
  };
};
