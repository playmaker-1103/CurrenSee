import { describe, expect, it } from "vitest";
import {
  getDefaultRouteForCurrencies,
  providers,
} from "./remit-data";
import { rankQuotes, type QuoteRequest } from "./remit-calculations";
import {
  createQuoteHistoryItem,
  createQuoteSnapshots,
  createWatchlistRule,
  getProviderTrendSnapshots,
  upsertQuoteHistory,
  upsertQuoteSnapshots,
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

  it("creates one historical snapshot per provider quote", () => {
    const quotes = rankQuotes(providers, request);
    const snapshots = createQuoteSnapshots(
      request,
      quotes,
      quotes[0].midMarketRate,
      { live: 1, fallback: 6 },
      "2026-05-29T12:00:00.000Z",
    );

    expect(snapshots).toHaveLength(providers.length);
    expect(snapshots[0]).toMatchObject({
      providerId: quotes[0].provider.id,
      rate: quotes[0].rate,
      benchmarkRate: quotes[0].midMarketRate,
      sourceCurrency: "EUR",
      targetCurrency: "VND",
    });
  });

  it("stores unique quote snapshots newest-first with a limit", () => {
    const quotes = rankQuotes(providers, request);
    const olderSnapshots = createQuoteSnapshots(
      request,
      quotes,
      quotes[0].midMarketRate,
      { live: 0, fallback: 7 },
      "2026-05-29T11:00:00.000Z",
    );
    const newerSnapshots = createQuoteSnapshots(
      request,
      quotes,
      quotes[0].midMarketRate,
      { live: 1, fallback: 6 },
      "2026-05-29T12:00:00.000Z",
    );

    const stored = upsertQuoteSnapshots(
      [...olderSnapshots, ...newerSnapshots],
      newerSnapshots,
      8,
    );

    expect(stored).toHaveLength(8);
    expect(stored[0].capturedAt).toBe("2026-05-29T12:00:00.000Z");
  });

  it("returns provider trend snapshots for the active corridor", () => {
    const quotes = rankQuotes(providers, request);
    const wiseQuote = quotes.find((quote) => quote.provider.id === "wise");

    expect(wiseQuote).toBeDefined();

    const stored = [
      ...createQuoteSnapshots(
        request,
        quotes,
        quotes[0].midMarketRate,
        { live: 1, fallback: 6 },
        "2026-05-29T11:00:00.000Z",
      ),
      ...createQuoteSnapshots(
        request,
        quotes,
        quotes[0].midMarketRate,
        { live: 1, fallback: 6 },
        "2026-05-29T12:00:00.000Z",
      ),
    ];

    const trend = getProviderTrendSnapshots(stored, request, "wise");

    expect(trend).toHaveLength(2);
    expect(trend.map((snapshot) => snapshot.providerId)).toEqual([
      "wise",
      "wise",
    ]);
    expect(trend[0].capturedAt).toBe("2026-05-29T11:00:00.000Z");
  });
});
