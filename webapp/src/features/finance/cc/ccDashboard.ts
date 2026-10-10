/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { wholeAmount } from "../util/financeFormat";
import type {
  CcAgeBucketAmount,
  CcCategoryMonthAmount,
  CcLeadTeamCardHolder,
  CcLeadTeamUnsubmittedSummary,
  CcManagerCompliance,
} from "./ccTypes";

// The dashboard's date arithmetic and bucketing, as pure functions —
// transcribed from view/dashboard/utils.ts.

/** :10-21 — month arithmetic that clamps the day, so 31 Jan − 1 month is 28/29 Feb. */
function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), daysInTarget));
  return target;
}

/** Local date, not UTC — `toIsoDate` in the source builds the parts by hand. */
function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** :40-43 — "As of 31 Aug 2026". */
export function asOfDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-UK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(now);
}

export type CcSummaryPeriod = "allTime" | "last6Months" | "lastYear";

/** :28-32. */
export const CC_SUMMARY_PERIODS: { value: CcSummaryPeriod; label: string }[] = [
  { value: "allTime", label: "All time" },
  { value: "last6Months", label: "Last 6 months" },
  { value: "lastYear", label: "Last year" },
];

/** :34-38 — "All time" sends no lower bound at all. */
export function summaryDateFrom(
  period: CcSummaryPeriod,
  now: Date = new Date(),
): string | undefined {
  if (period === "allTime") return undefined;
  return toIsoDate(addMonths(now, period === "last6Months" ? -6 : -12));
}

/** :45 */
export const CC_BREAKDOWN_MONTHS = 6;

/** :47-52 — e.g. "Mar - Aug 2026". */
export function reportingWindowLabel(now: Date = new Date()): string {
  const start = addMonths(now, -(CC_BREAKDOWN_MONTHS - 1));
  const month = new Intl.DateTimeFormat("en-UK", { month: "short" });
  return `${month.format(start)} - ${month.format(now)} ${now.getFullYear()}`;
}

/** :54-57 — the breakdown always spans the last six months. */
export function breakdownDateRange(now: Date = new Date()): { dateFrom: string; dateTo: string } {
  const start = addMonths(now, -(CC_BREAKDOWN_MONTHS - 1));
  start.setDate(1);
  return { dateFrom: toIsoDate(start), dateTo: toIsoDate(now) };
}

export type CcGranularity = "monthly" | "quarterly" | "yearly";

/** :74-78 — note "yearly" is labelled Annually. */
export const CC_GRANULARITIES: { value: CcGranularity; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Annually" },
];

export interface CcBreakdownRow {
  category: string;
  amounts: number[];
  total: number;
}

export interface CcBreakdown {
  monthLabels: string[];
  rows: CcBreakdownRow[];
  monthTotals: number[];
  grandTotal: number;
}

const quarterOf = (month: number) => Math.floor((month - 1) / 3) + 1;

const bucketKey = (g: CcGranularity, year: number, month: number) =>
  g === "yearly"
    ? `${year}`
    : g === "quarterly"
      ? `${year}-Q${quarterOf(month)}`
      : `${year}-${String(month).padStart(2, "0")}`;

const bucketLabel = (g: CcGranularity, year: number, month: number, fmt: Intl.DateTimeFormat) =>
  g === "yearly"
    ? `${year}`
    : g === "quarterly"
      ? `Q${quarterOf(month)} ${year}`
      : fmt.format(new Date(year, month - 1, 1));

/**
 * :99-145 — spend per category per bucket over the last six months.
 *
 * The buckets come from the six months themselves, so quarterly and yearly
 * views collapse them rather than widening the window; an item outside those
 * months is dropped. Rows are ordered by total, largest first.
 */
export function buildBreakdown(
  items: CcCategoryMonthAmount[],
  granularity: CcGranularity = "monthly",
  now: Date = new Date(),
): CcBreakdown {
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short" });

  const order: string[] = [];
  const labels = new Map<string, string>();
  for (let i = 0; i < CC_BREAKDOWN_MONTHS; i++) {
    const d = addMonths(now, -(CC_BREAKDOWN_MONTHS - 1 - i));
    const key = bucketKey(granularity, d.getFullYear(), d.getMonth() + 1);
    if (!labels.has(key)) {
      order.push(key);
      labels.set(key, bucketLabel(granularity, d.getFullYear(), d.getMonth() + 1, monthFmt));
    }
  }
  const indexByKey = new Map(order.map((key, i) => [key, i]));

  const byCategory = new Map<string, number[]>();
  for (const item of items) {
    const [year, month] = item.txnMonth.split("-").map(Number);
    const i = indexByKey.get(bucketKey(granularity, year, month));
    if (i === undefined) continue;
    const amounts = byCategory.get(item.category) ?? new Array(order.length).fill(0);
    amounts[i] += item.amount || 0;
    byCategory.set(item.category, amounts);
  }

  const monthTotals = new Array(order.length).fill(0);
  byCategory.forEach((amounts) => amounts.forEach((a, i) => (monthTotals[i] += a)));

  const rows = [...byCategory.entries()]
    .map(([category, amounts]) => ({
      category,
      amounts,
      total: amounts.reduce((s, a) => s + a, 0),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    monthLabels: order.map((k) => labels.get(k) as string),
    rows,
    monthTotals,
    grandTotal: monthTotals.reduce((s, a) => s + a, 0),
  };
}

export interface CcTeamUnsubmittedTotals {
  count: number;
  amount: number;
  avgDaysOutstanding: number | null;
  ageBuckets: CcAgeBucketAmount[];
}

/**
 * A lead's team-wide unsubmitted totals for the drill-down's summary tiles.
 * The two totals are summed from the card-holder rows already fetched for
 * `CcLeadTeamUnsubmittedTable` (each row already carries its own unsubmitted
 * count/amount); the average age and the age buckets come from a separate call
 * since the rows only carry bucket *counts*, not the dollar value per bucket
 * (or the team-wide average) the tiles need.
 */
export function summarizeTeamUnsubmitted(
  cardHolders: CcLeadTeamCardHolder[],
  summary: CcLeadTeamUnsubmittedSummary | undefined,
): CcTeamUnsubmittedTotals {
  return {
    count: cardHolders.reduce((sum, holder) => sum + holder.unsubmittedCount, 0),
    amount: cardHolders.reduce((sum, holder) => sum + holder.unsubmittedAmount, 0),
    avgDaysOutstanding: summary?.avgDaysOutstanding ?? null,
    ageBuckets: Object.values(summary?.ageBuckets ?? {}),
  };
}

/**
 * Reminder text for a reporting manager about their direct reports' unsubmitted
 * credit card transactions, used as the body of the manager-compliance table's
 * "Email reminder" button. Each report line carries the same three figures the
 * manager compliance table shows per card holder: how many transactions are
 * pending, their total value, and the average days those transactions have
 * gone unsubmitted — so the manager doesn't have to open the app to see what
 * they're being asked to chase.
 */
export function buildManagerReminderMessage(manager: CcManagerCompliance, currency: string): string {
  // A manager with no name on record still gets a greeting, not "Hi ,".
  const firstName = manager.managerName.split(" ")[0] || "there";
  const count = manager.reports.length;
  const reportLines = manager.reports.map((report) => {
    // No pending transactions have a submit date to average yet, so there is
    // nothing to show — not a 0, which would misleadingly read as "on time".
    const avgDays = report.avgDaysToSubmit === null ? "" : `, avg ${report.avgDaysToSubmit.toFixed(1)} days pending`;
    return `- ${report.cardHolderName || report.employeeEmail}: ` +
      `${report.transactionCount} ${report.transactionCount === 1 ? "item" : "items"}, ` +
      `${currency} ${wholeAmount(report.outstandingAmount)}${avgDays}`;
  });
  // Same age-bucket shape the dashboard's "Unsubmitted by Age" tile uses, so the
  // manager sees the same breakdown finance is looking at — just as plain text.
  const ageBucketLines = [
    `- 0-7 days: ${manager.bucket0To7}`,
    `- 8-14 days: ${manager.bucket8To14}`,
    `- 15-30 days: ${manager.bucket15To30}`,
    `- 30+ days: ${manager.bucket30Plus}`,
  ];
  return [
    `Hi ${firstName}, ${count} of your direct reports ${count === 1 ? "has" : "have"} `
      + "unsubmitted credit card transactions:",
    ...reportLines,
    // The roll-up the manager is actually accountable for, so the figure they
    // act on is in the mail itself rather than left to them to add up.
    `Total unsubmitted across your team: ${manager.transactionCount} `
      + `${manager.transactionCount === 1 ? "transaction" : "transactions"}, `
      + `${currency} ${wholeAmount(manager.outstandingAmount)}, `
      + `avg ${manager.avgPendingDays.toFixed(1)} days outstanding.`,
    "Unsubmitted by age:",
    ...ageBucketLines,
    "Please remind them to submit their claims promptly.",
  ].join("\n");
}

/**
 * A `mailto:` link that opens the viewer's own email client with a reminder
 * to a reporting manager pre-filled, used by the manager-compliance table's
 * "Email reminder" button. The admin reviews and sends it themselves — this
 * app never sends mail on their behalf.
 */
export function buildManagerReminderMailto(manager: CcManagerCompliance, currency: string): string {
  const subject = "Pending credit card expense submissions";
  const body = buildManagerReminderMessage(manager, currency);
  return `mailto:${encodeURIComponent(manager.managerEmail)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;
}
