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

import { saveBlob } from "@utils/saveFile";
import { getCategoryBreakdown, type BreakdownTab } from "./expenseDashboardUtils";
import type { ExpenseClaimsReport, ExpenseDashboardPeriod } from "../expenseTypes";

// A leading =, +, -, @, tab or carriage return can make spreadsheet software
// treat the cell as a formula, so free-text values are prefixed with a quote
// before they reach the file. Numbers and generated percentages ("-12.5%") are
// exempt: they are ours, not user text, and the quote would show in Excel.
// Cells containing a quote, comma, or line break are wrapped in double quotes,
// with embedded quotes doubled.
const NUMERIC_LIKE = /^[-+]?\d+(\.\d+)?%?$/;

function escapeCell(value: string | number): string {
  const text = String(value ?? "");
  const guarded = !NUMERIC_LIKE.test(text) && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

const toRow = (cells: (string | number)[]): string => cells.map(escapeCell).join(",");

function section(title: string, header: string[], rows: (string | number)[][]): string[] {
  return [title, toRow(header), ...rows.map(toRow), ""];
}

/** The one breakdown `tab` names, as its own section. */
function breakdownSection(report: ExpenseClaimsReport, tab: BreakdownTab): string[] {
  const currency = report.reportingCurrency;

  if (tab === "Business Entity") {
    const change = (value?: number): string => (value === undefined ? "n/a" : `${value}%`);
    return section(
      "CLAIMS BY BUSINESS ENTITY",
      ["Business Entity", "Count", `Total Value (${currency})`, `Avg Value (${currency})`, "vs Prior Period"],
      report.entityBreakdown.map((item) => [
        item.legalName,
        item.claimCount,
        item.totalValue,
        item.averageClaimValue,
        change(item.totalValueChangePercentage),
      ]),
    );
  }

  if (tab === "Monthly") {
    // The same transposition the table renders, from the same helper, so the
    // file and the screen cannot disagree.
    const breakdown = getCategoryBreakdown(report.expenseTypeColumns, report.monthlyBreakdown);
    return section(
      "MONTHLY BREAKDOWN BY EXPENSE TYPE",
      ["Category", ...report.monthlyBreakdown.map((item) => item.label), `Total (${currency})`, "% of Total"],
      [
        ...breakdown.rows.map((row) => [
          row.expenseType,
          ...row.amountsByMonth,
          row.total,
          `${row.percentageOfTotal}%`,
        ]),
        // The table's footer row, carried into the file so a reader can
        // reconcile a month's column against it without re-adding it.
        ["Total", ...breakdown.monthTotals, breakdown.periodTotal, "100%"],
      ],
    );
  }

  return section(
    "CLAIMS BY EMPLOYEE",
    ["Employee", "Email", "Claims", "Pending", "Claims / Month", `Total Value (${currency})`],
    report.employeeBreakdown.map((item) => [
      item.employeeName,
      item.employeeEmail,
      item.claimCount,
      item.pendingCount,
      item.claimsPerMonth,
      item.totalValue,
    ]),
  );
}

/**
 * The breakdown on screen, as a CSV under its own heading, above a header
 * naming the period and currency the figures are in.
 *
 * @param report - The report the dashboard is showing, already narrowed by the applied filters.
 * @param period - The applied period, named in the header.
 * @param tab - The breakdown tab on screen, and the only one written.
 */
export function buildExpenseReportCsv(
  report: ExpenseClaimsReport,
  period: ExpenseDashboardPeriod,
  tab: BreakdownTab,
): string {
  const lines: string[] = [
    "Expense Claims Dashboard",
    toRow(["Period", period]),
    toRow(["Reporting currency", report.reportingCurrency]),
    "",
    ...breakdownSection(report, tab),
  ];

  return lines.join("\n");
}

const slug = (text: string): string => text.toLowerCase().replace(/\s+/g, "-");

export function downloadExpenseReportCsv(
  report: ExpenseClaimsReport,
  period: ExpenseDashboardPeriod,
  tab: BreakdownTab,
): void {
  // A leading BOM so Excel reads the file as UTF-8 rather than the local
  // codepage.
  const blob = new Blob(["﻿", buildExpenseReportCsv(report, period, tab)], {
    type: "text/csv;charset=utf-8",
  });
  // The tab is in the name too, so two breakdowns of one period do not collide
  // in the downloads folder.
  saveBlob(blob, `expense-claims-${slug(tab)}-${slug(period)}.csv`);
}
