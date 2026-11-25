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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_CATEGORIES,
  formatPercentage,
  getCategoryBreakdown,
  getCategoryOptions,
  getEmployeeOptions,
  getEntityCodeForLabel,
  getEntityLabel,
  getExpenseTypeIdsForCategory,
  getPeriodRange,
  percentageColor,
} from "./expenseDashboardUtils";
import type {
  ExpenseEmployee,
  ExpenseReportEmployeeOption,
  ExpenseReportMonthlyItem,
  ExpenseSubsidiarySummary,
  ExpenseTypeData,
} from "../expenseTypes";

// The live catalogue really does hold these names several times over, each row
// under its own GL code, which is what made the filter list one name repeatedly.
const AIR_TICKET = "Foreign Travel - Air Ticket";
const TAXI = "Foreign Travel - Taxi/Bus Ticket/Train Ticket (Outside the country of domicile)";
const CATALOGUE: ExpenseTypeData[] = [
  { id: 11, type: AIR_TICKET },
  { id: 12, type: TAXI },
  { id: 13, type: AIR_TICKET },
  { id: 14, type: TAXI },
  { id: 15, type: AIR_TICKET },
];

const employee = (over: Partial<ExpenseEmployee> & { workEmail: string }): ExpenseEmployee => ({
  firstName: "Ann",
  lastName: "Silva",
  employeeThumbnail: null,
  employeeStatus: "Active",
  ...over,
});

const withClaims = (employeeEmail: string, employeeName: string): ExpenseReportEmployeeOption => ({
  employeeEmail,
  employeeName,
});

const subsidiary = (over: Partial<ExpenseSubsidiarySummary>): ExpenseSubsidiarySummary => ({
  id: 1,
  code: "WSO2-LK",
  legalName: "WSO2 Lanka (Pvt) Ltd",
  currencyCode: "LKR",
  country: "Sri Lanka",
  ...over,
});

describe("getPeriodRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15)); // 15 Jul 2026, Q3
  });
  afterEach(() => vi.useRealTimers());

  it("covers the whole current month for Monthly", () => {
    expect(getPeriodRange("Monthly")).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31" });
  });

  it("covers the current quarter for Quarterly", () => {
    expect(getPeriodRange("Quarterly")).toEqual({ startDate: "2026-07-01", endDate: "2026-09-30" });
  });

  it("covers the current year for Annually", () => {
    expect(getPeriodRange("Annually")).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });

  // Open-ended: no startDate at all, which the backend reads as "no prior
  // period to compare against" — not an empty string, an absent key.
  it("has no start date for All Time", () => {
    const range = getPeriodRange("All Time");
    expect(range.startDate).toBeUndefined();
    expect(range.endDate).toBe("2026-07-15");
  });

  it("uses the supplied range for Custom", () => {
    expect(getPeriodRange("Custom", { startDate: "2026-01-05", endDate: "2026-01-20" })).toEqual({
      startDate: "2026-01-05",
      endDate: "2026-01-20",
    });
  });

  // A custom period with nothing picked yet seeds as the current quarter —
  // the same shape as switching INTO Custom for the first time.
  it("falls back to the current quarter for Custom with no range yet", () => {
    expect(getPeriodRange("Custom")).toEqual({ startDate: "2026-07-01", endDate: "2026-09-30" });
  });
});

describe("formatPercentage / percentageColor", () => {
  it("marks a rise with an up arrow and the success colour", () => {
    expect(formatPercentage(12)).toBe("▲ 12%");
    expect(percentageColor(12)).toBe("success.main");
  });

  it("marks a fall with a down arrow and the error colour", () => {
    expect(formatPercentage(-8)).toBe("▼ 8%");
    expect(percentageColor(-8)).toBe("error.main");
  });

  // Zero reads as neither a rise nor a fall, and counts as "not worse" —
  // the same bucket a real improvement falls into.
  it("gives zero no arrow, and the success colour", () => {
    expect(formatPercentage(0)).toBe(" 0%");
    expect(percentageColor(0)).toBe("success.main");
  });
});

describe("entity labels", () => {
  // Several subsidiaries share a legal name in real data — "WSO2 (UK)
  // LIMITED" covers both the UK and Spain entities — so the name alone
  // cannot identify a selection.
  it("disambiguates with the entity code only when a name repeats", () => {
    const uk = subsidiary({ id: 1, code: "WSO2-UK", legalName: "WSO2 (UK) LIMITED" });
    const spain = subsidiary({ id: 2, code: "WSO2-ES", legalName: "WSO2 (UK) LIMITED" });
    const lanka = subsidiary({ id: 3, code: "WSO2-LK", legalName: "WSO2 Lanka (Pvt) Ltd" });
    const all = [uk, spain, lanka];

    expect(getEntityLabel(uk, all)).toBe("WSO2 (UK) LIMITED (WSO2-UK)");
    expect(getEntityLabel(spain, all)).toBe("WSO2 (UK) LIMITED (WSO2-ES)");
    expect(getEntityLabel(lanka, all)).toBe("WSO2 Lanka (Pvt) Ltd");
  });

  it("resolves a label back to its entity code", () => {
    const uk = subsidiary({ id: 1, code: "WSO2-UK", legalName: "WSO2 (UK) LIMITED" });
    const spain = subsidiary({ id: 2, code: "WSO2-ES", legalName: "WSO2 (UK) LIMITED" });
    const all = [uk, spain];

    expect(getEntityCodeForLabel("WSO2 (UK) LIMITED (WSO2-ES)", all)).toBe("WSO2-ES");
    expect(getEntityCodeForLabel("Nothing like this exists", all)).toBeUndefined();
  });
});

describe("getCategoryOptions", () => {
  it("lists a repeated expense type name once", () => {
    expect(getCategoryOptions(CATALOGUE)).toEqual([AIR_TICKET, TAXI]);
  });

  it("keeps the order the catalogue first mentions each name in", () => {
    expect(getCategoryOptions([...CATALOGUE].reverse())).toEqual([AIR_TICKET, TAXI]);
  });

  it("has nothing to offer for an empty catalogue", () => {
    expect(getCategoryOptions([])).toEqual([]);
  });
});

describe("getExpenseTypeIdsForCategory", () => {
  it("returns every id filed under the name, not just the first", () => {
    expect(getExpenseTypeIdsForCategory(AIR_TICKET, CATALOGUE)).toEqual([11, 13, 15]);
    expect(getExpenseTypeIdsForCategory(TAXI, CATALOGUE)).toEqual([12, 14]);
  });

  it("filters on nothing for the All sentinel", () => {
    expect(getExpenseTypeIdsForCategory(ALL_CATEGORIES, CATALOGUE)).toBeUndefined();
  });

  // An empty array would reach the query builder as "no expenseTypeIds set", which
  // widens the report to every category while the dropdown still names one.
  it("returns undefined rather than an empty list for an unknown name", () => {
    expect(getExpenseTypeIdsForCategory("Nothing like this exists", CATALOGUE)).toBeUndefined();
  });
});

describe("getEmployeeOptions", () => {
  it("offers the directory by name, ordered by name", () => {
    const directory = [
      employee({ workEmail: "ben@wso2.com", firstName: "Ben", lastName: "Perera" }),
      employee({ workEmail: "ann@wso2.com", firstName: "Ann", lastName: "Silva" }),
    ];

    expect(getEmployeeOptions(directory, [])).toEqual([
      { employeeEmail: "ann@wso2.com", employeeName: "Ann Silva" },
      { employeeEmail: "ben@wso2.com", employeeName: "Ben Perera" },
    ]);
  });

  it("leaves out employees who have left", () => {
    const directory = [
      employee({ workEmail: "ann@wso2.com" }),
      employee({ workEmail: "gone@wso2.com", firstName: "Gone", lastName: "Away", employeeStatus: "Left" }),
      employee({ workEmail: "notice@wso2.com", firstName: "On", lastName: "Notice", employeeStatus: "Marked leaver" }),
    ];

    expect(getEmployeeOptions(directory, []).map((e) => e.employeeEmail)).toEqual([
      "ann@wso2.com",
      "notice@wso2.com",
    ]);
  });

  // The directory's own spelling and padding are not guaranteed, so a leaver has
  // to be recognised however the status happens to be cased or padded.
  it("leaves out a leaver whose status is cased or padded differently", () => {
    const directory = [
      employee({ workEmail: "ann@wso2.com" }),
      employee({ workEmail: "lower@wso2.com", firstName: "Low", lastName: "Case", employeeStatus: "left" }),
      employee({ workEmail: "padded@wso2.com", firstName: "Pad", lastName: "Ded", employeeStatus: " Left " }),
      employee({ workEmail: "shouty@wso2.com", firstName: "All", lastName: "Caps", employeeStatus: "LEFT" }),
    ];

    expect(getEmployeeOptions(directory, []).map((e) => e.employeeEmail)).toEqual(["ann@wso2.com"]);
  });

  // A status the directory does not set, or a value this app does not know, is
  // not a reason to make someone impossible to filter on.
  it("keeps an employee whose status is missing or unrecognised", () => {
    const directory = [
      employee({ workEmail: "ann@wso2.com", employeeStatus: null }),
      employee({ workEmail: "ben@wso2.com", firstName: "Ben", lastName: "Perera", employeeStatus: "Something else" }),
    ];

    expect(getEmployeeOptions(directory, []).map((e) => e.employeeEmail)).toEqual([
      "ann@wso2.com",
      "ben@wso2.com",
    ]);
  });

  it("adds an employee the report has claims for but the directory does not offer", () => {
    const options = getEmployeeOptions(
      [employee({ workEmail: "ann@wso2.com" })],
      [withClaims("gone@wso2.com", "Gone Away"), withClaims("ann@wso2.com", "Ann From The Report")],
    );

    expect(options).toEqual([
      { employeeEmail: "ann@wso2.com", employeeName: "Ann Silva" },
      { employeeEmail: "gone@wso2.com", employeeName: "Gone Away" },
    ]);
  });

  it("falls back to the work email when the directory holds no name", () => {
    const directory = [employee({ workEmail: "nameless@wso2.com", firstName: null, lastName: null })];

    expect(getEmployeeOptions(directory, [])).toEqual([
      { employeeEmail: "nameless@wso2.com", employeeName: "nameless@wso2.com" },
    ]);
  });

  it("qualifies a name two people share with the work email", () => {
    const directory = [
      employee({ workEmail: "ann.s@wso2.com", firstName: "Ann", lastName: "Silva" }),
      employee({ workEmail: "ann.silva@wso2.com", firstName: "Ann", lastName: "Silva" }),
      employee({ workEmail: "ben@wso2.com", firstName: "Ben", lastName: "Perera" }),
    ];

    expect(getEmployeeOptions(directory, [])).toEqual([
      { employeeEmail: "ann.s@wso2.com", employeeName: "Ann Silva (ann.s@wso2.com)" },
      { employeeEmail: "ann.silva@wso2.com", employeeName: "Ann Silva (ann.silva@wso2.com)" },
      { employeeEmail: "ben@wso2.com", employeeName: "Ben Perera" },
    ]);
  });

  it("has nothing to offer without a directory or a report", () => {
    expect(getEmployeeOptions([], [])).toEqual([]);
  });
});

describe("getCategoryBreakdown", () => {
  const month = (
    label: string,
    total: number,
    amounts: { expenseType: string; amount: number }[],
  ): ExpenseReportMonthlyItem => ({
    month: label,
    label,
    amounts,
    total,
    // Nil because nothing here reads it: the share these tests check is the
    // category's, which this helper computes rather than carries.
    percentageOfTotal: 0,
  });

  const twoMonths = [
    month("Jul 2026", 1000, [
      { expenseType: "Travel", amount: 600 },
      { expenseType: "Meals", amount: 400 },
    ]),
    month("Aug 2026", 1000, [
      { expenseType: "Travel", amount: 150 },
      { expenseType: "Meals", amount: 850 },
    ]),
  ];

  it("gives each category a row holding one amount per month", () => {
    const { rows } = getCategoryBreakdown(["Travel", "Meals"], twoMonths);

    expect(rows).toEqual([
      { expenseType: "Travel", amountsByMonth: [600, 150], total: 750, percentageOfTotal: 37.5 },
      { expenseType: "Meals", amountsByMonth: [400, 850], total: 1250, percentageOfTotal: 62.5 },
    ]);
  });

  it("totals each month and the period", () => {
    const { monthTotals, periodTotal } = getCategoryBreakdown(["Travel", "Meals"], twoMonths);

    expect(monthTotals).toEqual([1000, 1000]);
    expect(periodTotal).toBe(2000);
  });

  // The rows and the footer are two readings of one period, so a reader adding
  // either axis has to arrive at the same number.
  it("reconciles the row totals against the month totals", () => {
    const { rows, monthTotals, periodTotal } = getCategoryBreakdown(["Travel", "Meals"], twoMonths);

    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(periodTotal);
    expect(monthTotals.reduce((sum, total) => sum + total, 0)).toBe(periodTotal);
  });

  // A month that reports no amount for a category leaves a hole, and reading
  // by position rather than by name would pull the next month's figure into it.
  it("reads a month's amounts by name, so a missing category stays at zero", () => {
    const { rows } = getCategoryBreakdown(
      ["Travel", "Meals"],
      [month("Jul 2026", 400, [{ expenseType: "Meals", amount: 400 }])],
    );

    expect(rows[0]).toEqual({
      expenseType: "Travel",
      amountsByMonth: [0],
      total: 0,
      percentageOfTotal: 0,
    });
    expect(rows[1].amountsByMonth).toEqual([400]);
  });

  it("rounds a category's share to one decimal", () => {
    const { rows } = getCategoryBreakdown(
      ["Travel", "Meals", "Taxi"],
      [
        month("Jul 2026", 3, [
          { expenseType: "Travel", amount: 1 },
          { expenseType: "Meals", amount: 1 },
          { expenseType: "Taxi", amount: 1 },
        ]),
      ],
    );

    expect(rows.map((row) => row.percentageOfTotal)).toEqual([33.3, 33.3, 33.3]);
  });

  // Dividing by the period total would be a division by zero here, which would
  // put NaN% in every row rather than a share.
  it("reports every share as zero in a period with no value", () => {
    const { rows, periodTotal } = getCategoryBreakdown(
      ["Travel"],
      [month("Jul 2026", 0, [{ expenseType: "Travel", amount: 0 }])],
    );

    expect(periodTotal).toBe(0);
    expect(rows[0].percentageOfTotal).toBe(0);
  });

  it("has no rows without categories, and no months without a period", () => {
    expect(getCategoryBreakdown([], twoMonths).rows).toEqual([]);
    expect(getCategoryBreakdown(["Travel"], [])).toEqual({
      rows: [{ expenseType: "Travel", amountsByMonth: [], total: 0, percentageOfTotal: 0 }],
      monthTotals: [],
      periodTotal: 0,
    });
  });
});
