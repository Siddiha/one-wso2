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
import {
  DASH,
  latestPromotion,
  promotionSummary,
  serviceLength,
  sortPromotionsByBand,
} from "@features/my/api/derive";
import type { PromotionHistoryEntry } from "@features/my/api/types";

describe("serviceLength", () => {
  const today = new Date(2026, 7, 24); // 24 Aug 2026

  it("stops counting on the employee's final day", () => {
    // The bug this pins: an intern who left in 2019 was reading as "8y 1m"
    // in 2026, because tenure was measured to today regardless of status.
    expect(serviceLength("2018-07-15", today, "2019-01-15")).toBe("6m");
    // And it stays fixed however long ago that was.
    expect(serviceLength("2018-07-15", new Date(2030, 0, 1), "2019-01-15")).toBe("6m");
  });

  it("measures a current employee to today", () => {
    expect(serviceLength("2018-07-15", today)).toBe("8y 1m");
    expect(serviceLength("2018-07-15", today, null)).toBe("8y 1m");
  });

  it("counts a month only once its day-of-month is reached", () => {
    expect(serviceLength("2020-01-20", new Date(2020, 1, 19))).toBe("< 1m");
    expect(serviceLength("2020-01-20", new Date(2020, 1, 20))).toBe("1m");
  });

  it("borrows a year when the month goes negative", () => {
    // Nov 2019 → Feb 2020 is three months, not "-9".
    expect(serviceLength("2019-11-10", new Date(2020, 1, 10))).toBe("3m");
  });

  it("ignores an unparseable final day rather than blanking the value", () => {
    // A live figure beats no figure when the end date is junk.
    expect(serviceLength("2018-07-15", today, "not-a-date")).toBe("8y 1m");
    expect(serviceLength("2018-07-15", today, "")).toBe("8y 1m");
  });

  it("rejects a calendar-invalid final day instead of rolling it forward", () => {
    // parseDateOnly only range-checks the day, so 2026-02-31 survives it and
    // Date would silently roll it to 3 March — capping tenure on a day that
    // never existed. It must fall back to `now` like any other bad value.
    expect(serviceLength("2018-07-15", today, "2026-02-31")).toBe("8y 1m");
    expect(serviceLength("2018-07-15", today, "2023-02-29")).toBe("8y 1m");
    // A real leap day is still honoured.
    expect(serviceLength("2018-07-15", today, "2024-02-29")).toBe("5y 7m");
  });

  it("reports a placeholder for a final day before the start", () => {
    expect(serviceLength("2024-01-01", today, "2020-01-01")).toBe(DASH);
  });

  it("omits a unit that would read as zero", () => {
    // "0y 8m" and "3y 0m" both look like formatting artifacts; neither zero
    // is information anyone needs.
    expect(serviceLength("2018-07-15", new Date(2019, 2, 15))).toBe("8m");
    expect(serviceLength("2018-07-15", new Date(2021, 6, 15))).toBe("3y");
    // Both units present still shows both.
    expect(serviceLength("2018-07-15", new Date(2021, 8, 15))).toBe("3y 2m");
  });

  it("reports a placeholder for a missing or malformed start", () => {
    expect(serviceLength(null, today)).toBe(DASH);
    expect(serviceLength("2018-13-01", today)).toBe(DASH);
  });

  it("reads the date half of an ISO datetime", () => {
    expect(serviceLength("2018-07-15T09:30:00Z", today, "2019-01-15T17:00:00Z")).toBe("6m");
  });
});

// Minimal approved-request fixture; only the fields the ordering and the
// summary line read are meaningful.
function entry(p: Partial<PromotionHistoryEntry> = {}): PromotionHistoryEntry {
  return {
    id: 1,
    employeeEmail: "someone@wso2.com",
    currentJobBand: 4,
    currentJobRole: "Senior Software Engineer",
    nextJobBand: 5,
    promotionCycle: "2021-H1",
    promotionStatement: null,
    businessUnit: "Engineering",
    department: "Platform",
    team: "Integration",
    subTeam: null,
    promotionType: "NORMAL",
    status: "APPROVED",
    createdOn: "2021-03-01",
    updatedOn: "2021-04-22",
    ...p,
  };
}

describe("sortPromotionsByBand", () => {
  it("puts the highest job band first", () => {
    const sorted = sortPromotionsByBand([
      entry({ id: 1, nextJobBand: 5 }),
      entry({ id: 2, nextJobBand: 7 }),
      entry({ id: 3, nextJobBand: 6 }),
    ]);
    expect(sorted.map((e) => e.nextJobBand)).toEqual([7, 6, 5]);
  });

  it("ignores updatedOn when ordering", () => {
    // The bug this pins: an admin editing an old approved request bumps its
    // updatedOn, which under a timestamp sort would promote a 2021 record
    // above a genuinely later 2023 one.
    const sorted = sortPromotionsByBand([
      entry({ id: 1, nextJobBand: 5, promotionCycle: "2021-H1", updatedOn: "2026-09-18" }),
      entry({ id: 2, nextJobBand: 6, promotionCycle: "2023-H2", updatedOn: "2023-11-14" }),
    ]);
    expect(sorted[0].promotionCycle).toBe("2023-H2");
  });

  it("breaks ties on id, newest first", () => {
    const sorted = sortPromotionsByBand([
      entry({ id: 7, nextJobBand: 6 }),
      entry({ id: 9, nextJobBand: 6 }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([9, 7]);
  });

  it("leaves the caller's array untouched", () => {
    const list = [entry({ id: 1, nextJobBand: 5 }), entry({ id: 2, nextJobBand: 7 })];
    sortPromotionsByBand(list);
    expect(list.map((e) => e.id)).toEqual([1, 2]);
  });
});

describe("latestPromotion", () => {
  it("returns the highest band on record", () => {
    const top = latestPromotion([
      entry({ id: 1, nextJobBand: 5 }),
      entry({ id: 2, nextJobBand: 6, promotionCycle: "2023-H2" }),
    ]);
    expect(top?.promotionCycle).toBe("2023-H2");
  });

  it("returns null when nothing is approved", () => {
    // Drives the "No promotions" line rather than a false date.
    expect(latestPromotion([])).toBeNull();
    expect(latestPromotion(undefined)).toBeNull();
  });
});

describe("promotionSummary", () => {
  it("names the cycle and the band jump", () => {
    expect(
      promotionSummary(entry({ promotionCycle: "2023-H2", currentJobBand: 5, nextJobBand: 6 })),
    ).toBe("2023-H2 · JB 5 → 6");
  });
});
