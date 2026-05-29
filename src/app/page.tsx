"use client";

import {
  ArrowRightLeft,
  BadgeCheck,
  Banknote,
  Bell,
  BookmarkPlus,
  Clock3,
  Database,
  ExternalLink,
  History,
  LineChart,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  countryRoutes,
  getAvailableTargetCurrencies,
  getDefaultRouteForCurrencies,
  getDefaultTargetCurrency,
  paymentMethods,
  providers,
  sourceCurrencies,
  type PaymentMethod,
  type SourceCurrency,
  type TargetCurrency,
} from "@/lib/remit-data";
import {
  findCurrencyPair,
  formatCurrency,
  formatNumber,
  formatRate,
  rankQuotes,
  type CalculatedQuote,
  type QuoteRequest,
} from "@/lib/remit-calculations";
import type { QuoteApiResponse } from "@/lib/quote-api";
import {
  createQuoteHistoryItem,
  createWatchlistRule,
  upsertQuoteHistory,
  upsertWatchlist,
  type QuoteHistoryItem,
  type WatchlistRule,
} from "@/lib/saved-comparisons";

function formatRouteOption(route: {
  sendingCountry: string;
  receivingCountry: string;
}) {
  return `${route.sendingCountry} -> ${route.receivingCountry}`;
}

const routeOptions = countryRoutes.map(formatRouteOption);
const historyStorageKey = "currensee:quote-history";
const watchlistStorageKey = "currensee:watchlist";

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function readLocalList<T>(key: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeLocalList<T>(key: string, items: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Local storage can fail in private browsing; the dashboard still works.
  }
}

function statusClass(status: CalculatedQuote["freshnessStatus"]) {
  if (status === "Fresh") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "Cached") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-zinc-200 bg-zinc-100 text-zinc-600";
}

function confidenceClass(confidence: CalculatedQuote["provider"]["confidence"]) {
  if (confidence === "High") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (confidence === "Medium") {
    return "bg-indigo-100 text-indigo-800";
  }

  return "bg-amber-100 text-amber-800";
}

function formatSyncTime(dateText: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(dateText));
}

function formatSnapshotTime(dateText: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateText));
}

function normalizeAmountInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");

  if (!cleaned) {
    return "";
  }

  const [integerPart, ...decimalParts] = cleaned.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "");

  if (decimalParts.length === 0) {
    return normalizedInteger;
  }

  return `${normalizedInteger || "0"}.${decimalParts.join("")}`;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-zinc-700">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-h-32 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          {icon}
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
          Live model
        </span>
      </div>
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-2 text-sm leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full bg-emerald-100 px-3 text-xs font-semibold text-emerald-800">
      {children}
    </span>
  );
}

function ProviderMark({ quote }: { quote: CalculatedQuote }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
        style={{ backgroundColor: quote.provider.color }}
        aria-hidden="true"
      >
        {quote.provider.name
          .split(" ")
          .map((word) => word[0])
          .join("")
          .slice(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-zinc-950">
          {quote.provider.name}
        </p>
        <p className="text-xs text-zinc-500">{quote.provider.kind}</p>
      </div>
    </div>
  );
}

function FreshnessPill({ quote }: { quote: CalculatedQuote }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold",
        statusClass(quote.freshnessStatus),
      )}
    >
      {quote.freshnessLabel}
    </span>
  );
}

function ProviderTable({
  quotes,
  sourceCurrency,
  targetCurrency,
  selectedProviderId,
  onSelectProvider,
  sourceLabel,
}: {
  quotes: CalculatedQuote[];
  sourceCurrency: SourceCurrency;
  targetCurrency: TargetCurrency;
  selectedProviderId: string;
  onSelectProvider: (id: string) => void;
  sourceLabel: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            Provider comparison
          </h2>
          <p className="text-sm text-zinc-500">
            Ranked by payout, fee, speed, freshness, and reliability.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600">
          <Database size={14} aria-hidden="true" />
          {sourceLabel}
        </div>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Rank</th>
              <th className="px-4 py-3 font-semibold">Provider</th>
              <th className="px-4 py-3 font-semibold">Recipient gets</th>
              <th className="px-4 py-3 font-semibold">Fee</th>
              <th className="px-4 py-3 font-semibold">Rate</th>
              <th className="px-4 py-3 font-semibold">Spread</th>
              <th className="px-4 py-3 font-semibold">ETA</th>
              <th className="px-4 py-3 font-semibold">Freshness</th>
              <th className="px-4 py-3 font-semibold">Score</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {quotes.map((quote) => (
              <tr
                key={quote.provider.id}
                className={cx(
                  "transition hover:bg-emerald-50/40",
                  selectedProviderId === quote.provider.id && "bg-emerald-50/70",
                )}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                      {quote.rank}
                    </span>
                    {quote.badge && <Badge>{quote.badge}</Badge>}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <ProviderMark quote={quote} />
                </td>
                <td className="px-4 py-4">
                  <p className="font-semibold text-zinc-950">
                    {formatCurrency(quote.recipientAmount, targetCurrency)}
                  </p>
                  <p className="text-xs text-emerald-700">
                    +{formatCurrency(quote.savingsVsWorst, targetCurrency)} vs
                    worst
                  </p>
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {formatCurrency(quote.feeAmount, sourceCurrency)}
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {formatRate(quote.rate, targetCurrency)}
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {quote.spreadPercent.toFixed(2)}%
                </td>
                <td className="px-4 py-4 text-zinc-700">
                  {quote.provider.deliveryLabel}
                </td>
                <td className="px-4 py-4">
                  <FreshnessPill quote={quote} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded-full bg-zinc-100">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${quote.score}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-zinc-800">
                      {quote.score}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    data-testid="provider-inspect"
                    data-provider-id={quote.provider.id}
                    onClick={() => onSelectProvider(quote.provider.id)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-emerald-400 hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  >
                    <Search size={15} aria-hidden="true" />
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 p-4 lg:hidden">
        {quotes.map((quote) => (
          <button
            key={quote.provider.id}
            type="button"
            data-testid="provider-card"
            data-provider-id={quote.provider.id}
            onClick={() => onSelectProvider(quote.provider.id)}
            className={cx(
              "rounded-lg border p-4 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-emerald-100",
              selectedProviderId === quote.provider.id
                ? "border-emerald-300 bg-emerald-50"
                : "border-zinc-200 bg-white",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <ProviderMark quote={quote} />
              <span className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                {quote.rank}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-500">Recipient gets</p>
                <p className="font-semibold text-zinc-950">
                  {formatCurrency(quote.recipientAmount, targetCurrency)}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Fee</p>
                <p className="font-semibold text-zinc-950">
                  {formatCurrency(quote.feeAmount, sourceCurrency)}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">ETA</p>
                <p className="font-semibold text-zinc-950">
                  {quote.provider.deliveryLabel}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Score</p>
                <p className="font-semibold text-zinc-950">{quote.score}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BreakdownPanel({
  quote,
  sourceCurrency,
  targetCurrency,
  amount,
}: {
  quote: CalculatedQuote;
  sourceCurrency: SourceCurrency;
  targetCurrency: TargetCurrency;
  amount: number;
}) {
  const rows = [
    {
      label: "You send",
      value: formatCurrency(amount, sourceCurrency),
    },
    {
      label: "Transfer fee",
      value: formatCurrency(quote.feeAmount, sourceCurrency),
    },
    {
      label: "Amount converted",
      value: formatCurrency(quote.amountConverted, sourceCurrency),
    },
    {
      label: "Provider rate",
      value: `1 ${sourceCurrency} = ${formatRate(quote.rate, targetCurrency)}`,
    },
    {
      label: "Recipient gets",
      value: formatCurrency(quote.recipientAmount, targetCurrency),
    },
    {
      label: "Hidden FX cost",
      value: formatCurrency(quote.hiddenCostSource, sourceCurrency),
    },
  ];

  return (
    <aside
      data-testid="quote-breakdown"
      className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">Quote breakdown</p>
          <div className="mt-2">
            <ProviderMark quote={quote} />
          </div>
        </div>
        <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-bold text-white">
          #{quote.rank}
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex min-h-12 items-center justify-between gap-3 border-b border-zinc-100 pb-3 last:border-0 last:pb-0"
          >
            <span className="text-sm text-zinc-500">{row.label}</span>
            <span className="text-right text-sm font-semibold text-zinc-950">
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-700">Confidence</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">
            {quote.provider.confidence}
          </p>
        </div>
        <div className="rounded-lg bg-indigo-50 p-3">
          <p className="text-xs font-semibold text-indigo-700">Freshness</p>
          <p className="mt-1 text-sm font-semibold text-indigo-950">
            {quote.freshnessLabel}
          </p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-6 text-zinc-600">
        {quote.provider.notes}
      </p>

      <a
        href={quote.provider.url}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-zinc-200"
      >
        <ExternalLink size={16} aria-hidden="true" />
        Open provider
      </a>
    </aside>
  );
}

function ProviderBars({
  quotes,
  targetCurrency,
}: {
  quotes: CalculatedQuote[];
  targetCurrency: TargetCurrency;
}) {
  const maxRecipientAmount = Math.max(
    ...quotes.map((quote) => quote.recipientAmount),
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            Payout comparison
          </h2>
          <p className="text-sm text-zinc-500">
            Recipient amount for the selected route.
          </p>
        </div>
        <LineChart className="text-emerald-600" size={22} aria-hidden="true" />
      </div>

      <div className="mt-6 grid gap-4">
        {quotes.map((quote) => (
          <div key={quote.provider.id} className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-zinc-700">
                {quote.provider.name}
              </span>
              <span className="font-semibold text-zinc-950">
                {formatCurrency(quote.recipientAmount, targetCurrency)}
              </span>
            </div>
            <div className="h-3 rounded-full bg-zinc-100">
              <div
                className="h-3 rounded-full"
                style={{
                  width: `${Math.max((quote.recipientAmount / maxRecipientAmount) * 100, 8)}%`,
                  backgroundColor: quote.provider.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TrendPanel({
  sourceCurrency,
  targetCurrency,
  benchmarkRate,
}: {
  sourceCurrency: SourceCurrency;
  targetCurrency: TargetCurrency;
  benchmarkRate: number;
}) {
  const trend = [
    { label: "Mon", rate: benchmarkRate * 0.991 },
    { label: "Tue", rate: benchmarkRate * 0.995 },
    { label: "Wed", rate: benchmarkRate * 0.998 },
    { label: "Thu", rate: benchmarkRate * 1.001 },
    { label: "Fri", rate: benchmarkRate },
  ];
  const values = trend.map((item) => item.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Rate trend</h2>
          <p className="text-sm text-zinc-500">
            Five-day reference trend for {sourceCurrency} to {targetCurrency}.
          </p>
        </div>
        <TrendingUp className="text-indigo-600" size={22} aria-hidden="true" />
      </div>

      <div className="mt-6 grid min-h-56 grid-cols-5 items-end gap-3">
        {trend.map((day) => {
          const height = ((day.rate - min) / (max - min || 1)) * 100;

          return (
            <div key={day.label} className="grid gap-2">
              <div className="flex h-40 items-end rounded-lg bg-zinc-50 p-2">
                <div
                  className="w-full rounded-md bg-indigo-500"
                  style={{ height: `${Math.max(height, 16)}%` }}
                  aria-label={`${day.label} rate ${day.rate}`}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-zinc-600">
                  {day.label}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatNumber(day.rate)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentComparisonsPanel({
  items,
  onApply,
  onClear,
}: {
  items: QuoteHistoryItem[];
  onApply: (item: QuoteHistoryItem) => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            Recent comparisons
          </h2>
          <p className="text-sm text-zinc-500">
            Latest quote snapshots saved on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={items.length === 0}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-rose-300 hover:text-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={16} aria-hidden="true" />
          Clear
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        {items.length === 0 ? (
          <div className="flex min-h-24 items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 text-sm font-medium text-zinc-500">
            <History size={18} aria-hidden="true" />
            Saved comparisons will appear after the first quote refresh.
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-zinc-950">
                    {item.sourceCurrency} to {item.targetCurrency}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600">
                    {formatSnapshotTime(item.savedAt)}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    {item.sourceSummary.live} live
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  {formatCurrency(item.amount, item.sourceCurrency)} via{" "}
                  {item.paymentMethod} from {item.sendingCountry} to{" "}
                  {item.receivingCountry}
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-950">
                  {item.bestProviderName}:{" "}
                  {formatCurrency(item.recipientAmount, item.targetCurrency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onApply(item)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-zinc-200"
              >
                <RefreshCw size={15} aria-hidden="true" />
                Load
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function WatchlistPanel({
  rules,
  bestQuote,
  sourceCurrency,
  targetCurrency,
  onAddRule,
  onRemoveRule,
}: {
  rules: WatchlistRule[];
  bestQuote: CalculatedQuote;
  sourceCurrency: SourceCurrency;
  targetCurrency: TargetCurrency;
  onAddRule: () => void;
  onRemoveRule: (id: string) => void;
}) {
  const previewRate = bestQuote.rate * 1.005;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Watchlist</h2>
          <p className="text-sm text-zinc-500">
            Local target-rate rules for saved transfer corridors.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRule}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-emerald-400 hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-100"
        >
          <BookmarkPlus size={16} aria-hidden="true" />
          Track rate
        </button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <article className="min-h-36 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-emerald-950">
              Current target
            </h3>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Suggested
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-emerald-800">
            Track {sourceCurrency} to {targetCurrency} when the rate reaches{" "}
            {formatRate(previewRate, targetCurrency)}.
          </p>
        </article>

        {rules.length === 0 ? (
          <article className="min-h-36 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4 lg:col-span-2">
            <div className="flex items-center gap-2 font-semibold text-zinc-950">
              <Bell size={17} aria-hidden="true" />
              No watched routes yet
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Saved rate rules will stay in this browser until Firebase sync is
              added.
            </p>
          </article>
        ) : (
          rules.map((rule) => (
            <article
              key={rule.id}
              className="min-h-36 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-zinc-950">
                    {rule.sourceCurrency} to {rule.targetCurrency}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    {formatSnapshotTime(rule.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Remove watchlist rule"
                  onClick={() => onRemoveRule(rule.id)}
                  className="flex size-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-300 hover:text-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-100"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Watch {rule.providerName} until 1 {rule.sourceCurrency} reaches{" "}
                {formatRate(rule.targetRate, rule.targetCurrency)}.
              </p>
              <span className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600">
                {rule.status}
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [amountInput, setAmountInput] = useState("1000");
  const [sourceCurrency, setSourceCurrency] = useState<SourceCurrency>("EUR");
  const [targetCurrency, setTargetCurrency] = useState<TargetCurrency>("VND");
  const [route, setRoute] = useState(
    formatRouteOption(getDefaultRouteForCurrencies("EUR", "VND")),
  );
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("Bank transfer");
  const [selectedProviderId, setSelectedProviderId] = useState("remitly");
  const [lastSync, setLastSync] = useState("not synced");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [apiQuotes, setApiQuotes] = useState<CalculatedQuote[] | null>(null);
  const [liveBenchmarkRate, setLiveBenchmarkRate] = useState<number | null>(
    null,
  );
  const [quoteStatus, setQuoteStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sourceSummary, setSourceSummary] = useState({
    live: 0,
    fallback: providers.length,
    errors: [] as string[],
  });
  const [historyItems, setHistoryItems] = useState<QuoteHistoryItem[]>([]);
  const [watchlistRules, setWatchlistRules] = useState<WatchlistRule[]>([]);

  const [sendingCountry, receivingCountry] = route.split(" -> ");
  const amount = useMemo(() => Number(amountInput) || 0, [amountInput]);

  const request: QuoteRequest = useMemo(
    () => ({
      amount,
      sourceCurrency,
      targetCurrency,
      sendingCountry,
      receivingCountry,
      paymentMethod,
    }),
    [
      amount,
      sourceCurrency,
      targetCurrency,
      sendingCountry,
      receivingCountry,
      paymentMethod,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadQuotes() {
      setQuoteStatus("loading");
      setQuoteError(null);

      const params = new URLSearchParams({
        amount: String(request.amount),
        sourceCurrency: request.sourceCurrency,
        targetCurrency: request.targetCurrency,
        sendingCountry: request.sendingCountry,
        receivingCountry: request.receivingCountry,
        paymentMethod: request.paymentMethod,
      });

      try {
        const response = await fetch(`/api/quotes?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Quote API returned HTTP ${response.status}`);
        }

        const data = (await response.json()) as QuoteApiResponse;
        setApiQuotes(data.quotes);
        setLiveBenchmarkRate(data.benchmarkRate);
        setSourceSummary(data.sourceSummary);
        setLastSync(formatSyncTime(data.fetchedAt));
        if (data.quotes[0]) {
          const historyItem = createQuoteHistoryItem(
            data.request,
            data.quotes[0],
            data.sourceSummary,
            data.fetchedAt,
          );

          setHistoryItems((currentItems) => {
            const baseItems =
              currentItems.length > 0
                ? currentItems
                : readLocalList<QuoteHistoryItem>(historyStorageKey);
            const nextItems = upsertQuoteHistory(baseItems, historyItem);
            writeLocalList(historyStorageKey, nextItems);
            return nextItems;
          });
        }
        setQuoteStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setQuoteStatus("error");
        setQuoteError(
          error instanceof Error ? error.message : "Quote refresh failed",
        );
      }
    }

    loadQuotes();

    return () => controller.abort();
  }, [request, refreshNonce]);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      setHistoryItems(readLocalList<QuoteHistoryItem>(historyStorageKey));
      setWatchlistRules(readLocalList<WatchlistRule>(watchlistStorageKey));
    });

    return () => {
      active = false;
    };
  }, []);

  const fallbackQuotes = useMemo(() => rankQuotes(providers, request), [request]);
  const quotes = apiQuotes ?? fallbackQuotes;
  const selectedQuote =
    quotes.find((quote) => quote.provider.id === selectedProviderId) ??
    quotes[0];
  const bestQuote = quotes[0];
  const cheapestQuote = quotes.reduce((best, quote) =>
    quote.feeAmount < best.feeAmount ? quote : best,
  );
  const fastestQuote = quotes.reduce((best, quote) =>
    quote.provider.deliveryMinutes < best.provider.deliveryMinutes
      ? quote
      : best,
  );
  const pair = findCurrencyPair(request);
  const benchmarkRate = liveBenchmarkRate ?? pair.midMarketRate;
  const bankQuotes = quotes.filter((quote) => quote.provider.kind === "Irish bank");
  const bestBankQuote = bankQuotes[0] ?? quotes[0];
  const availableTargetCurrencies = useMemo(
    () => getAvailableTargetCurrencies(sourceCurrency),
    [sourceCurrency],
  );

  const handleSourceCurrencyChange = (value: string) => {
    const nextSourceCurrency = value as SourceCurrency;
    const nextTargetCurrency =
      targetCurrency === nextSourceCurrency
        ? getDefaultTargetCurrency(nextSourceCurrency)
        : targetCurrency;

    setSourceCurrency(nextSourceCurrency);
    setTargetCurrency(nextTargetCurrency);
    setRoute(
      formatRouteOption(
        getDefaultRouteForCurrencies(nextSourceCurrency, nextTargetCurrency),
      ),
    );
  };

  const handleTargetCurrencyChange = (value: string) => {
    const nextTargetCurrency = value as TargetCurrency;
    setTargetCurrency(nextTargetCurrency);
    setRoute(
      formatRouteOption(
        getDefaultRouteForCurrencies(sourceCurrency, nextTargetCurrency),
      ),
    );
  };

  const handleApplyHistory = (item: QuoteHistoryItem) => {
    const savedRoute = formatRouteOption({
      sendingCountry: item.sendingCountry,
      receivingCountry: item.receivingCountry,
    });

    setAmountInput(normalizeAmountInput(String(item.amount)));
    setSourceCurrency(item.sourceCurrency);
    setTargetCurrency(item.targetCurrency);
    setRoute(
      routeOptions.includes(savedRoute)
        ? savedRoute
        : formatRouteOption(
            getDefaultRouteForCurrencies(item.sourceCurrency, item.targetCurrency),
          ),
    );
    setPaymentMethod(item.paymentMethod);
    setSelectedProviderId(item.bestProviderId);
    setRefreshNonce((value) => value + 1);
  };

  const handleClearHistory = () => {
    setHistoryItems([]);
    writeLocalList(historyStorageKey, []);
  };

  const handleAddWatchRule = () => {
    const rule = createWatchlistRule(request, bestQuote);

    setWatchlistRules((currentRules) => {
      const nextRules = upsertWatchlist(currentRules, rule);
      writeLocalList(watchlistStorageKey, nextRules);
      return nextRules;
    });
  };

  const handleRemoveWatchRule = (id: string) => {
    setWatchlistRules((currentRules) => {
      const nextRules = currentRules.filter((rule) => rule.id !== id);
      writeLocalList(watchlistStorageKey, nextRules);
      return nextRules;
    });
  };
  const sourceLabel =
    quoteStatus === "loading"
      ? "Refreshing adapters"
      : `${sourceSummary.live} live / ${sourceSummary.fallback} fallback`;

  return (
    <main className="min-h-screen bg-[#f7f8f4] text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-zinc-950 text-white">
              <ArrowRightLeft size={22} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
                CurrenSee
              </h1>
              <p className="text-sm text-zinc-500">
                FX comparison intelligence for international students.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700">
              <ShieldCheck size={16} aria-hidden="true" />
              No money movement
            </span>
            <button
              type="button"
              onClick={() => setRefreshNonce((value) => value + 1)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh quotes
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            icon={<Sparkles size={21} aria-hidden="true" />}
            label="Best overall"
            value={bestQuote.provider.name}
            detail={`${formatCurrency(bestQuote.recipientAmount, targetCurrency)} recipient payout`}
          />
          <MetricTile
            icon={<Banknote size={21} aria-hidden="true" />}
            label="Lowest fee"
            value={cheapestQuote.provider.name}
            detail={`${formatCurrency(cheapestQuote.feeAmount, sourceCurrency)} total fee`}
          />
          <MetricTile
            icon={<Clock3 size={21} aria-hidden="true" />}
            label="Fastest option"
            value={fastestQuote.provider.name}
            detail={fastestQuote.provider.deliveryLabel}
          />
          <MetricTile
            icon={<BadgeCheck size={21} aria-hidden="true" />}
            label="Best bank benchmark"
            value={bestBankQuote.provider.name}
            detail={`${formatCurrency(bestBankQuote.recipientAmount, targetCurrency)} recipient payout`}
          />
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <label className="grid gap-2 text-sm font-medium text-zinc-700 xl:w-56">
              <span>Amount to compare</span>
              <div className="flex h-11 items-center rounded-lg border border-zinc-200 bg-white px-3 shadow-sm focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-100">
                <span className="mr-2 text-sm font-semibold text-zinc-500">
                  {sourceCurrency}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) =>
                    setAmountInput(normalizeAmountInput(event.target.value))
                  }
                  className="h-full w-full bg-transparent text-sm font-semibold text-zinc-950 outline-none"
                  aria-label="Amount to compare"
                />
              </div>
            </label>

            <SelectField
              label="From"
              value={sourceCurrency}
              onChange={handleSourceCurrencyChange}
              options={sourceCurrencies}
            />
            <SelectField
              label="To"
              value={targetCurrency}
              onChange={handleTargetCurrencyChange}
              options={availableTargetCurrencies}
            />
            <SelectField
              label="Route"
              value={route}
              onChange={setRoute}
              options={routeOptions}
            />
            <SelectField
              label="Payment method"
              value={paymentMethod}
              onChange={(value) => setPaymentMethod(value as PaymentMethod)}
              options={paymentMethods}
            />

            <div className="flex min-h-11 items-center gap-2 rounded-lg bg-zinc-100 px-3 text-sm font-semibold text-zinc-600 xl:ml-auto">
              <SlidersHorizontal size={16} aria-hidden="true" />
              Synced {quoteStatus === "loading" ? "refreshing" : lastSync}
            </div>
          </div>
          {quoteError && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Live quote refresh failed. Cached comparison data is still shown.
              Reason: {quoteError}
            </div>
          )}
        </section>

        <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <ProviderTable
            quotes={quotes}
            sourceCurrency={sourceCurrency}
            targetCurrency={targetCurrency}
            selectedProviderId={selectedQuote.provider.id}
            onSelectProvider={setSelectedProviderId}
            sourceLabel={sourceLabel}
          />
          <BreakdownPanel
            quote={selectedQuote}
            sourceCurrency={sourceCurrency}
            targetCurrency={targetCurrency}
            amount={amount}
          />
        </section>

        <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <ProviderBars quotes={quotes} targetCurrency={targetCurrency} />

          <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">
                  Mid-market benchmark
                </h2>
                <p className="text-sm text-zinc-500">
                  Route baseline for fair comparison.
                </p>
              </div>
              <TriangleAlert
                className="text-amber-600"
                size={22}
                aria-hidden="true"
              />
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-sm font-medium text-zinc-500">
                  Mid-market rate
                </p>
                <p className="mt-1 text-2xl font-semibold text-zinc-950">
                  1 {sourceCurrency} = {formatRate(benchmarkRate, targetCurrency)}
                </p>
              </div>
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-500">Best provider spread</span>
                  <span className="text-sm font-semibold text-zinc-950">
                    {bestQuote.spreadPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-500">Worst provider gap</span>
                  <span className="text-sm font-semibold text-zinc-950">
                    {formatCurrency(
                      quotes[0].recipientAmount -
                        quotes[quotes.length - 1].recipientAmount,
                      targetCurrency,
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-500">Data disclaimer</span>
                  <span className="text-right text-sm font-semibold text-zinc-950">
                    Live where available
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <TrendPanel
            sourceCurrency={sourceCurrency}
            targetCurrency={targetCurrency}
            benchmarkRate={benchmarkRate}
          />

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-950">
                  Data quality
                </h2>
                <p className="text-sm text-zinc-500">
                  Source type and confidence by provider.
                </p>
              </div>
              <Database className="text-emerald-600" size={22} aria-hidden="true" />
            </div>

            <div className="mt-5 grid gap-3">
              {quotes.map((quote) => (
                <div
                  key={quote.provider.id}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4"
                >
                  <ProviderMark quote={quote} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600">
                      {quote.provider.sourceType}
                    </span>
                    <span
                      className={cx(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        confidenceClass(quote.provider.confidence),
                      )}
                    >
                      {quote.provider.confidence}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <RecentComparisonsPanel
          items={historyItems}
          onApply={handleApplyHistory}
          onClear={handleClearHistory}
        />

        <WatchlistPanel
          rules={watchlistRules}
          sourceCurrency={sourceCurrency}
          targetCurrency={targetCurrency}
          bestQuote={bestQuote}
          onAddRule={handleAddWatchRule}
          onRemoveRule={handleRemoveWatchRule}
        />
      </div>
    </main>
  );
}
