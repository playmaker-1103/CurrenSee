import { NextResponse } from "next/server";
import { getComparisonQuotes, parseQuoteRequest } from "@/lib/provider-adapters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const quoteRequest = parseQuoteRequest(new URL(request.url).searchParams);
  const response = await getComparisonQuotes(quoteRequest);

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
