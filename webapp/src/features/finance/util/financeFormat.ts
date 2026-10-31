// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

// Native formatting/date helpers for the finance feature — no dayjs / money
// lib in one-wso2 (matches the Leave feature's approach). `YYYY-MM-DD`
// strings are parsed in the LOCAL calendar to avoid the UTC-midnight
// off-by-one for users west of UTC.

// Money with its ISO currency code, thousand separators, 2 decimals.
// e.g. money(1234.5, "LKR") → "LKR 1,234.50"; money(80, "USD") → "USD 80.00".

// The cc dashboard drops the cents throughout — `formatCurrency(x).split(".")[0]`
// in utils.ts:44-49 — and names the currency in the column header instead of
// prefixing every figure.
export function wholeAmount(amount: number | null | undefined): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(
    ".",
  )[0];
}

/**
 * An amount with no currency marker, two decimals.
 *
 * The card screens need this because their column header carries the currency
 * instead: the source's grids are headed "Amount($)" and render a bare number
 * through `formatCurrency` (utils.ts:44-49). Passing them through `money`
 * puts a second "$" in every cell, under a header that already has one.
 */
export function bareAmount(amount: number | null | undefined): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function money(amount: number | null | undefined, currency = "LKR"): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Always the ISO code, never a symbol. Only four currencies ever had a symbol
  // mapped, so the same screen showed "$100.00" beside "CAD 100.00" — Finance
  // reads these columns across entities and asked for one consistent form. A
  // code also says WHICH dollar: "$" is ambiguous across USD, CAD and AUD,
  // which all appear in this data.
  return `${currency} ${formatted}`;
}

// Today as "YYYY-MM-DD" in the local calendar.
export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse "YYYY-MM-DD[...]" (or a UTC datetime like the createdDate fields) as
// a local calendar day. Returns null on an unrecognisable value.
export function parseIso(input: string | null | undefined): Date | null {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // Reject impossible dates instead of letting the Date constructor roll them
  // over (e.g. 2026-02-31 → Mar 3), matching the leave date parser.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

// "Aug 15, 2026" from an ISO date/datetime string.
export function formatNice(input: string | null | undefined): string {
  const d = parseIso(input);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function startOfYearIso(year: number): string {
  return `${year}-01-01`;
}

export function endOfYearIso(year: number): string {
  return `${year}-12-31`;
}

// N days ago as an ISO date (for default "last 7 days" history windows).
export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIso(d);
}

/**
 * The exclusive-safe upper bound for a transaction window — `utils.ts:21-33`
 * in cc-expenses, which sets the end of today and then advances a day before
 * formatting. Asking up to *today* can drop transactions dated today, which is
 * why the source deliberately asks up to tomorrow.
 */
export function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toIso(d);
}
