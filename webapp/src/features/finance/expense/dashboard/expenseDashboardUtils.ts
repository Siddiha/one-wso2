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
  ExpenseSubsidiarySummary,
  ExpenseTypeData,
} from "../expenseTypes";

export const ALL_ENTITIES = "All entities";
export const ALL_CATEGORIES = "All categories";
export const ALL_STATUSES = "All statuses";
export const ALL_REGIONS = "All regions";
export const ALL_EMPLOYEES = "All employees";

/**
 * The expense type catalogue holds several rows under the same name, each with
 * its own GL code, so mapping it straight to labels repeats a name as many times
 * as it has rows. One entry per distinct name, in the order the catalogue first
 * mentions it.
 */
export function getCategoryOptions(expenseTypes: readonly ExpenseTypeData[]): string[] {
  return [...new Set(expenseTypes.map((expenseType) => expenseType.type))];
}

const ACTIVE_EMPLOYEE_STATUS = "Active";

/**
 * Who the Employee filter offers. The directory is taken as the source rather
 * than the report, so the whole list is there to choose from before any period
 * has been applied — deriving it from the report meant the names only appeared
 * once a period had been applied, and changed underneath whoever was reading it.
 *
 * Employees who have left are excluded, since they are most of the directory,
 * except where the report shows them filing claims in the period being viewed.
 * Leaving those out would make a name in the Employee table impossible to filter
 * on.
 *
 * A display name is not unique, so a repeated one is qualified with the work
 * email, the way `getEntityLabel` qualifies a repeated legal name. Without it two
 * different people offer the same choice and the reader cannot tell which they
 * are filtering on.
 */
export function getEmployeeOptions(
  employees: readonly ExpenseEmployee[],
  withClaims: readonly ExpenseReportEmployeeOption[],
): { employeeEmail: string; employeeName: string }[] {
  const named = new Map<string, string>();
  for (const employee of employees) {
    if (employee.employeeStatus !== ACTIVE_EMPLOYEE_STATUS) continue;
    const name = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
    named.set(employee.workEmail, name.length > 0 ? name : employee.workEmail);
  }
  for (const employee of withClaims) {
    if (!named.has(employee.employeeEmail)) named.set(employee.employeeEmail, employee.employeeName);
  }

  const timesNameUsed = new Map<string, number>();
  for (const name of named.values()) timesNameUsed.set(name, (timesNameUsed.get(name) ?? 0) + 1);

  return [...named]
    .map(([employeeEmail, employeeName]) => ({
      employeeEmail,
      employeeName:
        (timesNameUsed.get(employeeName) ?? 0) > 1 ? `${employeeName} (${employeeEmail})` : employeeName,
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/**
 * Every ID filed under the selected name, not just the first. Picking the first
 * would narrow the report to one of the duplicate rows and present that row's
 * share of the spend as the whole category's.
 */
export function getExpenseTypeIdsForCategory(
  category: string,
  expenseTypes: readonly ExpenseTypeData[],
): number[] | undefined {
  if (category === ALL_CATEGORIES) return undefined;
  const ids = expenseTypes.filter((expenseType) => expenseType.type === category).map((e) => e.id);
  // An empty list would read as "no filter" to the query builder and quietly widen
  // the report to every category, so an unmatched name stays undefined.
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
