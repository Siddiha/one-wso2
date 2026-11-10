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
  it("stacks all four tables under their own headings, plus the summary", () => {
    const csv = buildExpenseReportCsv(report(), "All Time");

    expect(csv).toContain("SUMMARY");
    expect(csv).toContain("CLAIMS BY STATUS");
    expect(csv).toContain("CLAIMS BY BUSINESS ENTITY");
    expect(csv).toContain("MONTHLY BREAKDOWN BY EXPENSE TYPE");
    expect(csv).toContain("CLAIMS BY EMPLOYEE");
    expect(csv).toContain("Kasun Perera,kasun@wso2.com,10,1,2.5,1000");
  });

  // Absent, not "n/a" silently coerced from undefined, and not 0% — those
  // would both claim something the open-ended period never measured.
  it("marks a missing prior-period comparison as n/a, not 0%", () => {
    const csv = buildExpenseReportCsv(
      report({ claimCountChangePercentage: undefined, totalValueChangePercentage: undefined }),
      "All Time",
    );

    expect(csv).toContain("Claim Count,10,n/a");
    expect(csv).toContain("Total Value,1000,n/a");
  });

  // The same rule for each entity row: an open-ended period has no prior
  // period, so the row's change is absent too and must not print "undefined%".
  it("marks an entity's missing comparison as n/a, not undefined%", () => {
    const base = report();
    const entity = { ...base.entityBreakdown[0], totalValueChangePercentage: undefined };
    const csv = buildExpenseReportCsv(report({ entityBreakdown: [entity] }), "All Time");

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
    );

    expect(csv).toContain("'=SUM(A1:A10)");
  });

  // Negative numbers and generated percentages are ours, not user text, so
  // they must not pick up the formula-guard quote (Excel would show it).
  it("leaves negative numbers and percentages unguarded", () => {
    const csv = buildExpenseReportCsv(
      report({
        claimCountChangePercentage: -50,
        totalValueChangePercentage: -12.5,
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
    );

    expect(csv).toContain("Claim Count,10,-50%");
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
    );

    expect(csv).toContain("'\t=cmd");
    expect(csv).toContain('"Line\rBreak"');
  });

  // A month missing one of the report's expense-type columns must still
  // line its OWN amounts up under the right column, not shift left.
  it("realigns a month's amounts against the full column list, not array order", () => {
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
    );

    // Column order is Travel, Meals — so a correct row reads 0 (Travel) then
    // 400 (Meals), not 400 shifted into the Travel column.
    expect(csv).toContain("Jul 2026,0,400,400,100%");
  });
});
