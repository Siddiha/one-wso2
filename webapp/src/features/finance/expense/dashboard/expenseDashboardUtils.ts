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

// Period-range and entity-label helpers for the expense dashboard. Amounts are
// formatted with the shared `money()` from financeFormat.ts, the same formatter
// every other finance screen uses, so the portal has one currency format.

import { toIso } from "../../util/financeFormat";
import type {
  ExpenseDashboardPeriod,
  ExpenseEmployee,
  ExpenseReportEmployeeOption,
  ExpenseReportMonthlyItem,
  ExpenseSubsidiarySummary,
  ExpenseTypeData,
} from "../expenseTypes";

export const ALL_ENTITIES = "All entities";
export const ALL_CATEGORIES = "All categories";
export const ALL_STATUSES = "All statuses";
export const ALL_REGIONS = "All regions";
export const ALL_EMPLOYEES = "All employees";

/** One entry per distinct expense type name, in the order the catalogue first
 *  mentions it. The catalogue holds a name once per GL code, so the raw list
 *  repeats a name as many times as it has rows. */
export function getCategoryOptions(expenseTypes: readonly ExpenseTypeData[]): string[] {
  return [...new Set(expenseTypes.map((expenseType) => expenseType.type))];
}

/** The directory status of someone who has left. */
const LEFT_EMPLOYEE_STATUS = "left";

/**
 * Everyone the Employee filter offers: `employees` minus those who have left,
 * plus anyone in `employeesWithClaims` the directory left out, each as the work
 * email filtered on and the display name shown, ordered by name. A name two
 * people share is qualified with the work email, so the two choices read apart.
 */
export function getEmployeeOptions(
  employees: readonly ExpenseEmployee[],
  employeesWithClaims: readonly ExpenseReportEmployeeOption[],
): ExpenseReportEmployeeOption[] {
  const namesByEmail = new Map<string, string>();
  for (const employee of employees) {
    // Only leavers are dropped, rather than keeping only "Active", so a missing or
    // unrecognised status is still offered. Normalised as the status chip helper does.
    if (employee.employeeStatus?.trim().toLowerCase() === LEFT_EMPLOYEE_STATUS) continue;
    const name = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
    namesByEmail.set(employee.workEmail, name.length > 0 ? name : employee.workEmail);
  }
  for (const employee of employeesWithClaims) {
    if (!namesByEmail.has(employee.employeeEmail)) {
      namesByEmail.set(employee.employeeEmail, employee.employeeName);
    }
  }

  const timesNameUsed = new Map<string, number>();
  for (const name of namesByEmail.values()) timesNameUsed.set(name, (timesNameUsed.get(name) ?? 0) + 1);

  return [...namesByEmail]
    .map(([employeeEmail, employeeName]) => ({
      employeeEmail,
      employeeName:
        (timesNameUsed.get(employeeName) ?? 0) > 1 ? `${employeeName} (${employeeEmail})` : employeeName,
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** Every expense type ID filed under `category`, or undefined for the
 *  `ALL_CATEGORIES` sentinel and for a name the catalogue does not hold. */
export function getExpenseTypeIdsForCategory(
  category: string,
  expenseTypes: readonly ExpenseTypeData[],
): number[] | undefined {
  if (category === ALL_CATEGORIES) return undefined;
  const ids = expenseTypes.filter((expenseType) => expenseType.type === category).map((e) => e.id);
  // An empty list reads as "no expense type filter" and widens the report to every
  // category, so an unmatched name stays undefined.
  return ids.length > 0 ? ids : undefined;
}

/** `startDate` is omitted for an open-ended period ("All Time"), which the
 *  backend treats as unbounded and skips the prior-period comparison for. */
export interface PeriodRange {
  startDate?: string;
  endDate: string;
}

/**
 * Each preset covers its whole calendar period, first day through last, except
 * All Time, which runs up to today. `new Date(y, m + 1, 0)` is the last day of
 * month `m`, which keeps month lengths and leap years correct without a date
 * library.
 */
export function getPeriodRange(
  preset: ExpenseDashboardPeriod,
  customRange?: { startDate: string; endDate: string },
): PeriodRange {
  const now = new Date();

  if (preset === "Custom" && customRange) return customRange;

  switch (preset) {
    case "Monthly":
      return {
        startDate: toIso(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: toIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "Annually":
      return {
        startDate: toIso(new Date(now.getFullYear(), 0, 1)),
        endDate: toIso(new Date(now.getFullYear(), 11, 31)),
      };
    case "All Time":
      return { endDate: toIso(now) };
    // A custom period with no range yet behaves as the current quarter, which
    // is also what seeds the date fields when someone first switches to it.
    case "Custom":
    case "Quarterly":
    default: {
      const startMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        startDate: toIso(new Date(now.getFullYear(), startMonth, 1)),
        endDate: toIso(new Date(now.getFullYear(), startMonth + 3, 0)),
      };
    }
  }
}

export function formatPercentage(value: number): string {
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "";
  return `${arrow} ${Math.abs(value)}%`;
}

export function percentageColor(value: number): "success.main" | "error.main" {
  return value >= 0 ? "success.main" : "error.main";
}

/**
 * Several subsidiaries share a legal name — "WSO2 (UK) LIMITED" covers both
 * the UK and Spain entities — so the legal name alone cannot identify a
 * selection. The entity code is appended whenever a name is ambiguous.
 */
export function getEntityLabel(
  subsidiary: ExpenseSubsidiarySummary,
  subsidiaries: readonly ExpenseSubsidiarySummary[],
): string {
  const sharesName = subsidiaries.filter((other) => other.legalName === subsidiary.legalName).length > 1;
  return sharesName ? `${subsidiary.legalName} (${subsidiary.code})` : subsidiary.legalName;
}

export function getEntityCodeForLabel(
  label: string,
  subsidiaries: readonly ExpenseSubsidiarySummary[],
): string | undefined {
  return subsidiaries.find((subsidiary) => getEntityLabel(subsidiary, subsidiaries) === label)?.code;
}

/** One category of the breakdown: its amount in each month of the period, its
 *  period total and its share of that period. */
export interface ExpenseCategoryBreakdownRow {
  expenseType: string;
  /** One amount per month, positionally matching the report's months. */
  amountsByMonth: number[];
  total: number;
  percentageOfTotal: number;
}

/** The breakdown read by category: `rows` per category, `monthTotals` per
 *  month and the period total the two reconcile to. */
export interface ExpenseCategoryBreakdown {
  rows: ExpenseCategoryBreakdownRow[];
  monthTotals: number[];
  periodTotal: number;
}

/**
 * The monthly breakdown read the other way round — a row per expense category
 * and a column per month, which is the orientation both the table and the CSV
 * export render.
 *
 * @param expenseTypeColumns - Every expense category the report covers, in the order they are shown.
 * @param monthlyBreakdown - The report's months, in the order they are shown.
 */
export function getCategoryBreakdown(
  expenseTypeColumns: readonly string[],
  monthlyBreakdown: readonly ExpenseReportMonthlyItem[],
): ExpenseCategoryBreakdown {
  const monthTotals = monthlyBreakdown.map((item) => item.total);
  const periodTotal = monthTotals.reduce((sum, total) => sum + total, 0);

  const rows = expenseTypeColumns.map((expenseType) => {
    // Found by name in each month rather than taken by position, so a month
    // whose amounts omit a category cannot shift the rest of that row.
    const amountsByMonth = monthlyBreakdown.map(
      (item) => item.amounts.find((amount) => amount.expenseType === expenseType)?.amount ?? 0,
    );
    const total = amountsByMonth.reduce((sum, amount) => sum + amount, 0);
    return {
      expenseType,
      amountsByMonth,
      total,
      // One decimal, matching the month shares the backend sends.
      percentageOfTotal: periodTotal === 0 ? 0 : Math.round((total / periodTotal) * 1000) / 10,
    };
  });

  return { rows, monthTotals, periodTotal };
}

/** The breakdown tables, one per tab, in the order the tabs are shown. */
export const BREAKDOWN_TABS = ["Business Entity", "Monthly", "Employee"] as const;

export type BreakdownTab = (typeof BREAKDOWN_TABS)[number];
