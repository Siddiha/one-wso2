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

import { describe, expect, it } from "vitest";
import {
  breakdownDateRange,
  buildBreakdown,
  buildManagerReminderMessage,
  reportingWindowLabel,
  summaryDateFrom,
} from "./ccDashboard";
import type { CcManagerCompliance } from "./ccTypes";

// The dashboard's arithmetic, from view/dashboard/utils.ts. Expected values are
// worked out from the rules, not read off a run.

// :34-38 — "All time" sends no lower bound at all, which is what makes the
// backend return everything rather than a default window.
describe("the summary period", () => {
  const now = new Date(2026, 7, 31); // 31 Aug 2026

  it("sends nothing for all time", () => {
    expect(summaryDateFrom("allTime", now)).toBeUndefined();
  });

  it("goes back six months", () => {
    expect(summaryDateFrom("last6Months", now)).toBe("2026-02-28");
  });

  it("goes back a year", () => {
    expect(summaryDateFrom("lastYear", now)).toBe("2025-08-31");
  });

  // :10-21 — the day is clamped to the target month's length, so stepping back
  // from a 31st never rolls into the following month.
  it("clamps the day rather than overflowing the month", () => {
    expect(summaryDateFrom("last6Months", new Date(2026, 11, 31))).toBe("2026-06-30");
  });
});

// :54-57 — the breakdown always spans six months, starting at the first of the
// earliest one.
describe("the breakdown window", () => {
  it("starts on the first of the month six back", () => {
    expect(breakdownDateRange(new Date(2026, 7, 31))).toEqual({
      dateFrom: "2026-03-01",
      dateTo: "2026-08-31",
    });
  });

  it("labels the window by month", () => {
    expect(reportingWindowLabel(new Date(2026, 7, 31))).toBe("Mar - Aug 2026");
  });
});

// :99-145
describe("the category breakdown", () => {
  const now = new Date(2026, 7, 15); // Aug 2026, so Mar..Aug
  const items = [
    { category: "Travel", txnMonth: "2026-08", amount: 300 },
    { category: "Travel", txnMonth: "2026-07", amount: 200 },
    { category: "Software", txnMonth: "2026-08", amount: 1000 },
  ];

  it("lays out six monthly buckets", () => {
    const b = buildBreakdown(items, "monthly", now);
    expect(b.monthLabels).toEqual(["Mar", "Apr", "May", "Jun", "Jul", "Aug"]);
  });

  it("orders categories by total, largest first", () => {
    const b = buildBreakdown(items, "monthly", now);
    expect(b.rows.map((r) => r.category)).toEqual(["Software", "Travel"]);
    expect(b.rows[0].total).toBe(1000);
    expect(b.rows[1].total).toBe(500);
  });

  it("totals each bucket and the whole grid", () => {
    const b = buildBreakdown(items, "monthly", now);
    expect(b.monthTotals).toEqual([0, 0, 0, 0, 200, 1300]);
    expect(b.grandTotal).toBe(1500);
  });

  it("collapses the same six months into quarters rather than widening", () => {
    const b = buildBreakdown(items, "quarterly", now);
    // Mar is Q1; Apr-Jun is Q2; Jul-Aug falls in Q3.
    expect(b.monthLabels).toEqual(["Q1 2026", "Q2 2026", "Q3 2026"]);
    expect(b.grandTotal).toBe(1500);
  });

  it("collapses to a single bucket yearly", () => {
    const b = buildBreakdown(items, "yearly", now);
    expect(b.monthLabels).toEqual(["2026"]);
    expect(b.monthTotals).toEqual([1500]);
  });

  it("drops anything outside the window", () => {
    const b = buildBreakdown(
      [...items, { category: "Travel", txnMonth: "2025-01", amount: 9999 }],
      "monthly",
      now,
    );
    expect(b.grandTotal).toBe(1500);
  });
});

// ccDashboard.ts:182 — the reminder a manager is sent, copied from the
// manager-compliance table. Its greeting uses the manager's first name.
describe("the manager reminder", () => {
  const manager: CcManagerCompliance = {
    managerEmail: "lead@wso2.com",
    managerName: "Lead Person",
    reportCount: 2,
    outstandingAmount: 1200,
    transactionCount: 5,
    avgPendingDays: 20,
    bucket0To7: 1,
    bucket8To14: 1,
    bucket15To30: 2,
    bucket30Plus: 1,
    reports: [
      {
        employeeEmail: "late@wso2.com",
        cardHolderName: "Late Filer",
        outstandingAmount: 700,
        transactionCount: 2,
        avgDaysToSubmit: 41.5,
        bucket0To7: 0,
        bucket8To14: 0,
        bucket15To30: 1,
        bucket30Plus: 1,
      },
      {
        employeeEmail: "quiet@wso2.com",
        cardHolderName: "",
        outstandingAmount: 500,
        transactionCount: 1,
        avgDaysToSubmit: 5,
        bucket0To7: 1,
        bucket8To14: 0,
        bucket15To30: 0,
        bucket30Plus: 0,
      },
    ],
  };

  it("greets the manager by first name and lists each report with their own figures", () => {
    const message = buildManagerReminderMessage(manager, "USD");
    expect(message.split("\n")).toEqual([
      "Hi Lead, 2 of your direct reports have unsubmitted credit card transactions:",
      "- Late Filer: 2 items, USD 700, avg 41.5 days pending",
      "- quiet@wso2.com: 1 item, USD 500, avg 5.0 days pending",
      "Total unsubmitted across your team: 5 transactions, USD 1,200, avg 20.0 days outstanding.",
      "Unsubmitted by age:",
      "- 0-7 days: 1",
      "- 8-14 days: 1",
      "- 15-30 days: 2",
      "- 30+ days: 1",
      "Please remind them to submit their claims promptly.",
    ]);
  });

  it("leaves the average off a report that has no submit history to average", () => {
    const noHistory = { ...manager.reports[0], avgDaysToSubmit: null };
    const message = buildManagerReminderMessage({ ...manager, reports: [noHistory] }, "USD");

    expect(message).toContain("- Late Filer: 2 items, USD 700\n");
    expect(message).not.toContain("avg null");
  });

  it("uses a single report's wording when only one is outstanding", () => {
    const message = buildManagerReminderMessage({ ...manager, reports: [manager.reports[0]] }, "USD");
    expect(message).toContain("Hi Lead, 1 of your direct reports has unsubmitted credit card transactions:");
  });

  it("still greets a manager with no name on record, rather than 'Hi ,'", () => {
    const message = buildManagerReminderMessage({ ...manager, managerName: "" }, "USD");
    expect(message.split("\n")[0]).toBe(
      "Hi there, 2 of your direct reports have unsubmitted credit card transactions:",
    );
  });
});
