# CurrenSee

CurrenSee is a local-first FX comparison dashboard for international students who want to compare money transfer providers before sending funds abroad.

The current build uses a hybrid quote adapter layer. Wise is connected through the public unauthenticated Wise Platform quote endpoint, Revolut is ready for live Business API quotes when a token is configured, and providers without public quote access use cached or manual fallback data.

The app does not move money or initiate transfers.

## Features

- EUR, GBP, and USD to VND comparison routes
- Live Wise quote adapter
- Optional Revolut Business API quote adapter
- Cached/manual fallback adapters for Remitly, TaptapSend, AIB, Bank of Ireland, and Permanent TSB
- Ranked provider table based on payout, fee, speed, data freshness, and reliability
- Fee breakdown and hidden FX cost estimate
- Mid-market benchmark panel
- Provider payout bar chart
- Mock rate trend chart
- Data quality and quote freshness badges
- Watchlist panel prepared for future Firebase alerts

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Lucide React icons

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local` when you want to enable optional live provider integrations:

```bash
REVOLUT_BUSINESS_API_TOKEN=
REVOLUT_API_BASE_URL=https://b2b.revolut.com/api/1.0
```

Wise live quotes do not require a token for the current unauthenticated quote flow.

## Future Firebase/Vercel Work

Suggested next steps:

- Cache normalized provider quotes in Firestore
- Store watchlist alerts in Firestore
- Trigger quote refresh jobs with Firebase Cloud Functions or Vercel Cron
- Add authentication for saved routes and alerts
- Deploy the Next.js app on Vercel

## Data Disclaimer

Wise rows may use live API data. Revolut, Remitly, TaptapSend, and Irish bank rows may use cached or manually maintained fallback data unless their live credentials or partner access are configured. Always verify final pricing on the provider website before sending money.
