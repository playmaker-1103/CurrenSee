import { describe, expect, it } from "vitest";
import {
  getDefaultRouteForCurrencies,
  providers,
} from "./remit-data";
import {
  formatCurrency,
  getStaticQuoteInput,
  rankQuotes,
  type QuoteRequest,
} from "./remit-calculations";

const baseRoute = getDefaultRouteForCurrencies("EUR", "VND");
const baseRequest: QuoteRequest = {
  amount: 1000,
  sourceCurrency: "EUR",
  targetCurrency: "VND",
  sendingCountry: baseRoute.sendingCountry,
  receivingCountry: baseRoute.receivingCountry,
  paymentMethod: "Bank transfer",
};

describe("remit calculations", () => {
  it("ranks every provider with stable rank numbers and a best overall badge", () => {
    const rankedQuotes = rankQuotes(providers, baseRequest);

    expect(rankedQuotes).toHaveLength(providers.length);
    expect(rankedQuotes.map((quote) => quote.rank)).toEqual(
      providers.map((_, index) => index + 1),
    );
    expect(rankedQuotes[0].badge).toBe("Best overall");
    expect(rankedQuotes[0].score).toBeGreaterThanOrEqual(
      rankedQuotes[rankedQuotes.length - 1].score,
    );
  });

  it("calculates fixed, percentage, and payment-method fees", () => {
    const wise = providers.find((provider) => provider.id === "wise");

    expect(wise).toBeDefined();

    const quote = getStaticQuoteInput(wise!, {
      ...baseRequest,
      paymentMethod: "Debit card",
    });

    expect(quote.feeAmount).toBeCloseTo(4.5 + 1000 * (0.002 + 0.0035));
    expect(quote.amountConverted).toBeCloseTo(1000 - quote.feeAmount);
    expect(quote.recipientAmount).toBeGreaterThan(0);
  });

  it("formats zero-decimal payout currencies without cents", () => {
    expect(formatCurrency(1234.56, "VND")).not.toContain(".");
    expect(formatCurrency(1234.56, "JPY")).not.toContain(".");
    expect(formatCurrency(1234.56, "EUR")).toContain(".");
  });
});
