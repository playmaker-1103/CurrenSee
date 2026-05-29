import { describe, expect, it } from "vitest";
import {
  getDefaultRouteForCurrencies,
  providers,
} from "./remit-data";
import { rankQuotes, type QuoteRequest } from "./remit-calculations";
import {
  createQuoteHistoryItem,
  createWatchlistRule,
  upsertQuoteHistory,
  upsertWatchlist,
} from "./saved-comparisons";

const route = getDefaultRouteForCurrencies("EUR", "VND");
const request: QuoteRequest = {
  amount: 1000,
  sourceCurrency: "EUR",
  targetCurrency: "VND",
  sendingCountry: route.sendingCountry,
  receivingCountry: route.receivingCountry,
  paymentMethod: "Bank transfer",
};
const bestQuote = rankQuotes(providers, request)[0];

describe("saved comparisons", () => {
  it("creates quote history snapshots from the current best quote", () => {
    const item = createQuoteHistoryItem(
      request,
      bestQuote,
      { live: 1, fallback: 6 },
      "2026-05-29T12:00:00.000Z",
    );

    expect(item.bestProviderName).toBe(bestQuote.provider.name);
    expect(item.recipientAmount).toBe(bestQuote.recipientAmount);
    expect(item.sourceSummary).toEqual({ live: 1, fallback: 6 });
    expect(item.id).toContain("EUR:VND");
  });

  it("deduplicates repeated quote history by corridor and keeps the latest", () => {
    const older = createQuoteHistoryItem(
      request,
      bestQuote,
      { live: 0, fallback: 7 },
      "2026-05-29T11:00:00.000Z",
    );
    const newer = createQuoteHistoryItem(
      request,
      bestQuote,
      { live: 1, fallback: 6 },
      "2026-05-29T12:00:00.000Z",
    );

    expect(upsertQuoteHistory([older], newer)).toEqual([newer]);
  });

  it("creates and deduplicates local watchlist rules", () => {
    const firstRule = createWatchlistRule(
      request,
      bestQuote,
      "2026-05-29T11:00:00.000Z",
    );
    const latestRule = createWatchlistRule(
      request,
      bestQuote,
      "2026-05-29T12:00:00.000Z",
    );

    expect(firstRule.targetRate).toBeGreaterThan(bestQuote.rate);
    expect(upsertWatchlist([firstRule], latestRule)).toEqual([latestRule]);
  });
});
