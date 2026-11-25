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

import { describe, expect, it } from "vitest";
import { buildExpenseReportCsv } from "./exportExpenseReportCsv";
import type { ExpenseClaimsReport } from "../expenseTypes";

const report = (over: Partial<ExpenseClaimsReport> = {}): ExpenseClaimsReport => ({
  reportingCurrency: "USD",
  current: { claimCount: 10, totalValue: 1000, averageClaimValue: 100 },
  prior: { claimCount: 8, totalValue: 800, averageClaimValue: 100 },
  claimCountChangePercentage: 25,
  totalValueChangePercentage: 25,
  averageClaimValueChangePercentage: 0,
  statusBreakdown: [{ status: "APPROVED", count: 10, averageDaysPending: 2 }],
  entityBreakdown: [
    {
      businessEntity: "WSO2-LK",
      legalName: "WSO2 Lanka (Pvt) Ltd",
      claimCount: 10,
      totalValue: 1000,
      averageClaimValue: 100,
      totalValueChangePercentage: 25,
    },
  ],
  expenseTypeColumns: ["Travel", "Meals"],
  monthlyBreakdown: [
    {
      month: "2026-07",
      label: "Jul 2026",
      amounts: [
        { expenseType: "Travel", amount: 600 },
        { expenseType: "Meals", amount: 400 },
      ],
      total: 1000,
      percentageOfTotal: 100,
    },
  ],
  employeeBreakdown: [
    {
      employeeEmail: "kasun@wso2.com",
      employeeName: "Kasun Perera",
      claimCount: 10,
      pendingCount: 1,
      claimsPerMonth: 2.5,
      totalValue: 1000,
    },
  ],
  availableSalesRegions: ["APAC"],
  availableEmployees: [{ employeeEmail: "ann@wso2.com", employeeName: "Ann Silva" }],
  ...over,
});

describe("buildExpenseReportCsv", () => {
  it("names the period and currency above the table", () => {
    const csv = buildExpenseReportCsv(report(), "All Time", "Employee");

    expect(csv).toContain("Period,All Time");
    expect(csv).toContain("Reporting currency,USD");
  });

  // One tab is one download. Finance asked for the breakdown they are looking
  // at, so a file carrying the other two makes them find the right table in it.
  it("writes the Employee breakdown alone when that tab is on screen", () => {
    const csv = buildExpenseReportCsv(report(), "All Time", "Employee");

    expect(csv).toContain("CLAIMS BY EMPLOYEE");
    expect(csv).toContain("Kasun Perera,kasun@wso2.com,10,1,2.5,1000");
    expect(csv).not.toContain("CLAIMS BY BUSINESS ENTITY");
    expect(csv).not.toContain("MONTHLY BREAKDOWN BY EXPENSE TYPE");
  });

  it("writes the Business Entity breakdown alone when that tab is on screen", () => {
    const csv = buildExpenseReportCsv(report(), "All Time", "Business Entity");

    expect(csv).toContain("CLAIMS BY BUSINESS ENTITY");
    expect(csv).toContain("WSO2 Lanka (Pvt) Ltd,10,1000,100,25%");
    expect(csv).not.toContain("CLAIMS BY EMPLOYEE");
    expect(csv).not.toContain("MONTHLY BREAKDOWN BY EXPENSE TYPE");
  });

  it("writes the Monthly breakdown alone when that tab is on screen", () => {
    const csv = buildExpenseReportCsv(report(), "All Time", "Monthly");

    expect(csv).toContain("MONTHLY BREAKDOWN BY EXPENSE TYPE");
    expect(csv).not.toContain("CLAIMS BY EMPLOYEE");
    expect(csv).not.toContain("CLAIMS BY BUSINESS ENTITY");
  });

  // The same rule for each entity row: an open-ended period has no prior
  // period, so the row's change is absent too and must not print "undefined%".
  it("marks an entity's missing comparison as n/a, not undefined%", () => {
    const base = report();
    const entity = { ...base.entityBreakdown[0], totalValueChangePercentage: undefined };
    const csv = buildExpenseReportCsv(report({ entityBreakdown: [entity] }), "All Time", "Business Entity");

    expect(csv).not.toContain("undefined");
    expect(csv).toContain(`${entity.legalName}`);
    expect(csv).toMatch(/,n\/a\n/);
  });

  // A value starting with =, +, - or @ is how a spreadsheet cell becomes a
  // live formula — an employee named "=1+1" must not execute as one.
  it("guards a formula-looking value with a leading quote", () => {
    const csv = buildExpenseReportCsv(
      report({
        employeeBreakdown: [
          {
            employeeEmail: "x@wso2.com",
            employeeName: "=SUM(A1:A10)",
            claimCount: 1,
            pendingCount: 0,
            claimsPerMonth: 1,
            totalValue: 50,
          },
        ],
      }),
      "All Time",
      "Employee",
    );

    expect(csv).toContain("'=SUM(A1:A10)");
  });

  // Negative numbers and generated percentages are ours, not user text, so
  // they must not pick up the formula-guard quote (Excel would show it).
  it("leaves negative numbers and percentages unguarded", () => {
    const csv = buildExpenseReportCsv(
      report({
        employeeBreakdown: [
          {
            employeeEmail: "x@wso2.com",
            employeeName: "Dilani",
            claimCount: 1,
            pendingCount: 0,
            claimsPerMonth: -1,
            totalValue: -50,
          },
        ],
      }),
      "All Time",
      "Employee",
    );

    expect(csv).toContain("Dilani,x@wso2.com,1,0,-1,-50");
    expect(csv).not.toContain("'-");
  });

  // Tab and carriage return can start a formula in spreadsheet software too,
  // and a carriage return inside a cell must not break the row apart.
  it("guards tab- and carriage-return-led values and quotes ones with a line break", () => {
    const csv = buildExpenseReportCsv(
      report({
        employeeBreakdown: [
          {
            employeeEmail: "x@wso2.com",
            employeeName: "\t=cmd",
            claimCount: 1,
            pendingCount: 0,
            claimsPerMonth: 1,
            totalValue: 50,
          },
          {
            employeeEmail: "y@wso2.com",
            employeeName: "Line\rBreak",
            claimCount: 1,
            pendingCount: 0,
            claimsPerMonth: 1,
            totalValue: 50,
          },
        ],
      }),
      "All Time",
      "Employee",
    );

    expect(csv).toContain("'\t=cmd");
    expect(csv).toContain('"Line\rBreak"');
  });

  // A month missing one of the report's expense-type columns must still leave
  // every category on its own row, rather than shifting a later month's amount
  // into the gap.
  it("leaves a category absent from a month at zero, not shifted", () => {
    const csv = buildExpenseReportCsv(
      report({
        monthlyBreakdown: [
          {
            month: "2026-07",
            label: "Jul 2026",
            // Only "Meals" present — "Travel" is missing from this month.
            amounts: [{ expenseType: "Meals", amount: 400 }],
            total: 400,
            percentageOfTotal: 100,
          },
        ],
      }),
      "All Time",
      "Monthly",
    );

    expect(csv).toContain("Travel,0,0,0%");
    expect(csv).toContain("Meals,400,400,100%");
  });

  it("writes the breakdown with categories as rows and months as columns", () => {
    const csv = buildExpenseReportCsv(
      report({
        monthlyBreakdown: [
          {
            month: "2026-07",
            label: "Jul 2026",
            amounts: [
              { expenseType: "Travel", amount: 600 },
              { expenseType: "Meals", amount: 400 },
            ],
            total: 1000,
            percentageOfTotal: 50,
          },
          {
            month: "2026-08",
            label: "Aug 2026",
            amounts: [
              { expenseType: "Travel", amount: 150 },
              { expenseType: "Meals", amount: 850 },
            ],
            total: 1000,
            percentageOfTotal: 50,
          },
        ],
      }),
      "All Time",
      "Monthly",
    );

    expect(csv).toContain("Category,Jul 2026,Aug 2026,Total (USD),% of Total");
    expect(csv).toContain("Travel,600,150,750,37.5%");
    expect(csv).toContain("Meals,400,850,1250,62.5%");
    // The footer row, so a reader can reconcile either axis against the period.
    expect(csv).toContain("Total,1000,1000,2000,100%");
  });
});
