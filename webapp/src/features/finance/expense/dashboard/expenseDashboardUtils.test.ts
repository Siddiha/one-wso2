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
  formatPercentage,
  getEntityCodeForLabel,
  getEntityLabel,
  getPeriodRange,
  percentageColor,
} from "./expenseDashboardUtils";
import type { ExpenseSubsidiarySummary } from "../expenseTypes";

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
