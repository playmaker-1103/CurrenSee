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
const panelClass =
  "rounded-2xl border border-zinc-200/80 bg-white/90 shadow-[0_18px_60px_rgba(24,24,27,0.07)] backdrop-blur dark:border-white/10 dark:bg-zinc-950/82 dark:shadow-none";
const insetPanelClass =
  "rounded-xl border border-zinc-200/80 bg-zinc-50/80 dark:border-white/10 dark:bg-white/[0.04]";
const fieldClass =
  "h-11 rounded-xl border border-zinc-200/80 bg-white/90 px-3 text-sm text-zinc-950 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-50 dark:shadow-none dark:focus:border-emerald-400 dark:focus:ring-emerald-400/15";
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200/80 bg-white/90 text-sm font-semibold text-zinc-700 shadow-[0_1px_2px_rgba(24,24,27,0.06)] transition hover:border-emerald-500/50 hover:text-emerald-700 active:translate-y-px focus:outline-none focus:ring-4 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:shadow-none dark:hover:border-emerald-400/50 dark:hover:text-emerald-300";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(4,120,87,0.22)] transition hover:bg-emerald-800 active:translate-y-px focus:outline-none focus:ring-4 focus:ring-emerald-500/20 dark:bg-emerald-500 dark:text-zinc-950 dark:shadow-[0_10px_32px_rgba(52,211,153,0.16)] dark:hover:bg-emerald-400";
const mutedTextClass = "text-zinc-500 dark:text-zinc-400";
const bodyTextClass = "text-zinc-600 dark:text-zinc-300";
const strongTextClass = "text-zinc-950 dark:text-zinc-50";

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
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300";
  }

  if (status === "Cached") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200";
  }

  return "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-300";
}

function confidenceClass(confidence: CalculatedQuote["provider"]["confidence"]) {
  if (confidence === "High") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300";
  }

  if (confidence === "Medium") {
    return "bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300";
  }

  return "bg-amber-100 text-amber-800 dark:bg-amber-300/10 dark:text-amber-200";
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
    <label className={cx("grid gap-2 text-sm font-medium", bodyTextClass)}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
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
    <div className={cx(panelClass, "min-h-32 p-4 transition hover:-translate-y-0.5")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
          {icon}
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
          Live model
        </span>
      </div>
      <p className={cx("text-sm font-medium", mutedTextClass)}>{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold", strongTextClass)}>
        {value}
      </p>
      <p className={cx("mt-2 text-sm leading-5", mutedTextClass)}>{detail}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full bg-emerald-100 px-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
      {children}
    </span>
  );
}

function ProviderMark({ quote }: { quote: CalculatedQuote }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm dark:shadow-none"
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
        <p className={cx("truncate font-semibold", strongTextClass)}>
          {quote.provider.name}
        </p>
        <p className={cx("text-xs", mutedTextClass)}>{quote.provider.kind}</p>
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
    <div className={panelClass}>
      <div className="flex flex-col gap-3 border-b border-zinc-200/80 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
        <div>
          <h2 className={cx("text-lg font-semibold", strongTextClass)}>
            Provider comparison
          </h2>
          <p className={cx("text-sm", mutedTextClass)}>
            Ranked by payout, fee, speed, freshness, and reliability.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
          <Database size={14} aria-hidden="true" />
          {sourceLabel}
        </div>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-zinc-50/80 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/[0.03] dark:text-zinc-400">
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
          <tbody className="divide-y divide-zinc-100 dark:divide-white/10">
            {quotes.map((quote) => (
              <tr
                key={quote.provider.id}
                className={cx(
                  "transition hover:bg-emerald-50/40 dark:hover:bg-emerald-400/[0.06]",
                  selectedProviderId === quote.provider.id &&
                    "bg-emerald-50/80 dark:bg-emerald-400/[0.08]",
                )}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-950">
                      {quote.rank}
                    </span>
                    {quote.badge && <Badge>{quote.badge}</Badge>}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <ProviderMark quote={quote} />
                </td>
                <td className="px-4 py-4">
                  <p className={cx("font-semibold", strongTextClass)}>
                    {formatCurrency(quote.recipientAmount, targetCurrency)}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    +{formatCurrency(quote.savingsVsWorst, targetCurrency)} vs
                    worst
                  </p>
                </td>
                <td className={cx("px-4 py-4", bodyTextClass)}>
                  {formatCurrency(quote.feeAmount, sourceCurrency)}
                </td>
                <td className={cx("px-4 py-4", bodyTextClass)}>
                  {formatRate(quote.rate, targetCurrency)}
                </td>
                <td className={cx("px-4 py-4", bodyTextClass)}>
                  {quote.spreadPercent.toFixed(2)}%
                </td>
                <td className={cx("px-4 py-4", bodyTextClass)}>
                  {quote.provider.deliveryLabel}
                </td>
                <td className="px-4 py-4">
                  <FreshnessPill quote={quote} />
                </td>
                <td className="px-4 py-4">
                  <span className="inline-flex min-h-8 items-center rounded-full border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100">
                    {quote.score}/100
                  </span>
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    data-testid="provider-inspect"
                    data-provider-id={quote.provider.id}
                    onClick={() => onSelectProvider(quote.provider.id)}
                    className={cx(secondaryButtonClass, "h-9 px-3")}
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
              "rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-emerald-500/15",
              selectedProviderId === quote.provider.id
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-400/[0.08]"
                : "border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <ProviderMark quote={quote} />
              <span className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-950">
                {quote.rank}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className={mutedTextClass}>Recipient gets</p>
                <p className={cx("font-semibold", strongTextClass)}>
                  {formatCurrency(quote.recipientAmount, targetCurrency)}
                </p>
              </div>
              <div>
                <p className={mutedTextClass}>Fee</p>
                <p className={cx("font-semibold", strongTextClass)}>
                  {formatCurrency(quote.feeAmount, sourceCurrency)}
                </p>
              </div>
              <div>
                <p className={mutedTextClass}>ETA</p>
                <p className={cx("font-semibold", strongTextClass)}>
                  {quote.provider.deliveryLabel}
                </p>
              </div>
              <div>
                <p className={mutedTextClass}>Score</p>
                <p className={cx("font-semibold", strongTextClass)}>
                  {quote.score}/100
                </p>
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
      className={cx(panelClass, "p-5")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={cx("text-sm font-medium", mutedTextClass)}>
            Quote breakdown
          </p>
          <div className="mt-2">
            <ProviderMark quote={quote} />
          </div>
        </div>
        <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-950">
          #{quote.rank}
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex min-h-12 items-center justify-between gap-3 border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-white/10"
          >
            <span className={cx("text-sm", mutedTextClass)}>{row.label}</span>
            <span className={cx("text-right text-sm font-semibold", strongTextClass)}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-400/10">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Confidence
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-950 dark:text-emerald-50">
            {quote.provider.confidence}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Freshness
          </p>
          <p className={cx("mt-1 text-sm font-semibold", strongTextClass)}>
            {quote.freshnessLabel}
          </p>
        </div>
      </div>

      <p className={cx("mt-5 text-sm leading-6", bodyTextClass)}>
        {quote.provider.notes}
      </p>

      <a
        href={quote.provider.url}
        target="_blank"
        rel="noreferrer"
        className={cx(primaryButtonClass, "mt-5 h-10 w-full px-4")}
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
    <section className={cx(panelClass, "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={cx("text-lg font-semibold", strongTextClass)}>
            Payout comparison
          </h2>
          <p className={cx("text-sm", mutedTextClass)}>
            Recipient amount for the selected route.
          </p>
        </div>
        <LineChart className="text-emerald-600" size={22} aria-hidden="true" />
      </div>

      <div className="mt-6 grid gap-4">
        {quotes.map((quote) => (
          <div key={quote.provider.id} className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className={cx("font-medium", bodyTextClass)}>
                {quote.provider.name}
              </span>
              <span className={cx("font-semibold", strongTextClass)}>
                {formatCurrency(quote.recipientAmount, targetCurrency)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/[0.06]">
              <div
                className="h-2 rounded-full"
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
    <section className={cx(panelClass, "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={cx("text-lg font-semibold", strongTextClass)}>
            Rate trend
          </h2>
          <p className={cx("text-sm", mutedTextClass)}>
            Five-day reference trend for {sourceCurrency} to {targetCurrency}.
          </p>
        </div>
        <TrendingUp className="text-emerald-600 dark:text-emerald-300" size={22} aria-hidden="true" />
      </div>

      <div className="mt-6 grid min-h-56 grid-cols-5 items-end gap-3">
        {trend.map((day) => {
          const height = ((day.rate - min) / (max - min || 1)) * 100;

          return (
            <div key={day.label} className="grid gap-2">
              <div className="flex h-40 items-end rounded-xl bg-zinc-50 p-2 dark:bg-white/[0.04]">
                <div
                  className="w-full rounded-md bg-emerald-600 dark:bg-emerald-400"
                  style={{ height: `${Math.max(height, 16)}%` }}
                  aria-label={`${day.label} rate ${day.rate}`}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  {day.label}
                </p>
                <p className={cx("text-xs", mutedTextClass)}>
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
    <section className={cx(panelClass, "p-5")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={cx("text-lg font-semibold", strongTextClass)}>
            Recent comparisons
          </h2>
          <p className={cx("text-sm", mutedTextClass)}>
            Latest quote snapshots saved on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={items.length === 0}
          className={cx(
            secondaryButtonClass,
            "h-10 px-4 hover:border-rose-300 hover:text-rose-700 focus:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:border-rose-300/40 dark:hover:text-rose-200",
          )}
        >
          <Trash2 size={16} aria-hidden="true" />
          Clear
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        {items.length === 0 ? (
          <div className="flex min-h-24 items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 text-sm font-medium text-zinc-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-400">
            <History size={18} aria-hidden="true" />
            Saved comparisons will appear after the first quote refresh.
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="grid gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx("font-semibold", strongTextClass)}>
                    {item.sourceCurrency} to {item.targetCurrency}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
                    {formatSnapshotTime(item.savedAt)}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
                    {item.sourceSummary.live} live
                  </span>
                </div>
                <p className={cx("mt-2 text-sm", bodyTextClass)}>
                  {formatCurrency(item.amount, item.sourceCurrency)} via{" "}
                  {item.paymentMethod} from {item.sendingCountry} to{" "}
                  {item.receivingCountry}
                </p>
                <p className={cx("mt-1 text-sm font-semibold", strongTextClass)}>
                  {item.bestProviderName}:{" "}
                  {formatCurrency(item.recipientAmount, item.targetCurrency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onApply(item)}
                className={cx(primaryButtonClass, "h-10 px-4")}
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
    <section className={cx(panelClass, "p-5")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={cx("text-lg font-semibold", strongTextClass)}>
            Watchlist
          </h2>
          <p className={cx("text-sm", mutedTextClass)}>
            Local target-rate rules for saved transfer corridors.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRule}
          className={cx(secondaryButtonClass, "h-10 px-4")}
        >
          <BookmarkPlus size={16} aria-hidden="true" />
          Track rate
        </button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <article className="min-h-36 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/10">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-emerald-950 dark:text-emerald-50">
              Current target
            </h3>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-white/[0.08] dark:text-emerald-200">
              Suggested
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-emerald-800 dark:text-emerald-100">
            Track {sourceCurrency} to {targetCurrency} when the rate reaches{" "}
            {formatRate(previewRate, targetCurrency)}.
          </p>
        </article>

        {rules.length === 0 ? (
          <article className="min-h-36 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 lg:col-span-2 dark:border-white/15 dark:bg-white/[0.04]">
            <div className={cx("flex items-center gap-2 font-semibold", strongTextClass)}>
              <Bell size={17} aria-hidden="true" />
              No watched routes yet
            </div>
            <p className={cx("mt-3 text-sm leading-6", bodyTextClass)}>
              Saved rate rules will stay in this browser until Firebase sync is
              added.
            </p>
          </article>
        ) : (
          rules.map((rule) => (
            <article
              key={rule.id}
              className="min-h-36 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className={cx("font-semibold", strongTextClass)}>
                    {rule.sourceCurrency} to {rule.targetCurrency}
                  </h3>
                  <p className={cx("mt-1 text-xs font-semibold", mutedTextClass)}>
                    {formatSnapshotTime(rule.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Remove watchlist rule"
                  onClick={() => onRemoveRule(rule.id)}
                  className="flex size-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-300 hover:text-rose-700 active:translate-y-px focus:outline-none focus:ring-4 focus:ring-rose-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:border-rose-300/40 dark:hover:text-rose-200"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
              <p className={cx("mt-3 text-sm leading-6", bodyTextClass)}>
                Watch {rule.providerName} until 1 {rule.sourceCurrency} reaches{" "}
                {formatRate(rule.targetRate, rule.targetCurrency)}.
              </p>
              <span className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
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
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(180deg,#f7faf6_0%,#eef4ef_100%)] text-zinc-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.12),transparent_32%),linear-gradient(180deg,#09090b_0%,#111113_100%)] dark:text-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/78 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/72">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-zinc-950 text-white shadow-[0_10px_30px_rgba(24,24,27,0.18)] dark:bg-zinc-50 dark:text-zinc-950 dark:shadow-none">
              <ArrowRightLeft size={22} aria-hidden="true" />
            </div>
            <div>
              <h1 className={cx("text-2xl font-semibold tracking-normal", strongTextClass)}>
                CurrenSee
              </h1>
              <p className={cx("text-sm", mutedTextClass)}>
                FX comparison intelligence for international students.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 text-sm font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200">
              <ShieldCheck size={16} aria-hidden="true" />
              No money movement
            </span>
            <button
              type="button"
              onClick={() => setRefreshNonce((value) => value + 1)}
              className={cx(primaryButtonClass, "h-10 px-4")}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh quotes
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className={cx(panelClass, "p-5")}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <label className={cx("grid gap-2 text-sm font-medium xl:w-56", bodyTextClass)}>
              <span>Amount to compare</span>
              <div className={cx(fieldClass, "flex items-center px-3")}>
                <span className={cx("mr-2 text-sm font-semibold", mutedTextClass)}>
                  {sourceCurrency}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) =>
                    setAmountInput(normalizeAmountInput(event.target.value))
                  }
                  className={cx("h-full w-full bg-transparent text-sm font-semibold outline-none", strongTextClass)}
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

            <div className="flex min-h-11 items-center gap-2 rounded-xl bg-zinc-100/80 px-3 text-sm font-semibold text-zinc-600 xl:ml-auto dark:bg-white/[0.06] dark:text-zinc-300">
              <SlidersHorizontal size={16} aria-hidden="true" />
              Synced {quoteStatus === "loading" ? "refreshing" : lastSync}
            </div>
          </div>
          {quoteError && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-100">
              Live quote refresh failed. Cached comparison data is still shown.
              Reason: {quoteError}
            </div>
          )}
        </section>

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

          <aside className={cx(panelClass, "p-5")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className={cx("text-lg font-semibold", strongTextClass)}>
                  Mid-market benchmark
                </h2>
                <p className={cx("text-sm", mutedTextClass)}>
                  Route baseline for fair comparison.
                </p>
              </div>
              <TriangleAlert
                className="text-emerald-600 dark:text-emerald-300"
                size={22}
                aria-hidden="true"
              />
            </div>

            <div className="mt-6 grid gap-4">
              <div className={cx(insetPanelClass, "p-4")}>
                <p className={cx("text-sm font-medium", mutedTextClass)}>
                  Mid-market rate
                </p>
                <p className={cx("mt-1 text-2xl font-semibold", strongTextClass)}>
                  1 {sourceCurrency} = {formatRate(benchmarkRate, targetCurrency)}
                </p>
              </div>
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className={cx("text-sm", mutedTextClass)}>
                    Best provider spread
                  </span>
                  <span className={cx("text-sm font-semibold", strongTextClass)}>
                    {bestQuote.spreadPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className={cx("text-sm", mutedTextClass)}>
                    Worst provider gap
                  </span>
                  <span className={cx("text-sm font-semibold", strongTextClass)}>
                    {formatCurrency(
                      quotes[0].recipientAmount -
                        quotes[quotes.length - 1].recipientAmount,
                      targetCurrency,
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className={cx("text-sm", mutedTextClass)}>
                    Data disclaimer
                  </span>
                  <span className={cx("text-right text-sm font-semibold", strongTextClass)}>
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

          <section className={cx(panelClass, "p-5")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className={cx("text-lg font-semibold", strongTextClass)}>
                  Data quality
                </h2>
                <p className={cx("text-sm", mutedTextClass)}>
                  Source type and confidence by provider.
                </p>
              </div>
              <Database
                className="text-emerald-600 dark:text-emerald-300"
                size={22}
                aria-hidden="true"
              />
            </div>

            <div className="mt-5 grid gap-3">
              {quotes.map((quote) => (
                <div
                  key={quote.provider.id}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <ProviderMark quote={quote} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
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
