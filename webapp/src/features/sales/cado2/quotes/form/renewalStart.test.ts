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
import { expectedRenewalStart, renewalStartWarning } from "./renewalStart";

describe("expectedRenewalStart (2026-10-09)", () => {
  it("is the day after the renewed opportunity ends", () => {
    expect(expectedRenewalStart([{ name: "APIM Subs 2026", subsEndDate: "2027-01-31" }])).toEqual({
      date: "2027-02-01",
      fromName: "APIM Subs 2026",
    });
    expect(expectedRenewalStart([{ name: "Leap", subsEndDate: "2028-02-28" }])?.date).toBe("2028-02-29");
    expect(expectedRenewalStart([{ name: "Year end", subsEndDate: "2026-12-31" }])?.date).toBe("2027-01-01");
  });

  it("takes the latest end date of several, and skips those without one", () => {
    expect(
      expectedRenewalStart([
        { name: "APIM Subs 2026", subsEndDate: "2027-01-31" },
        { name: "No dates", subsEndDate: null },
        { name: "IS Subs 2026", subsEndDate: "2027-03-31" },
      ]),
    ).toEqual({ date: "2027-04-01", fromName: "IS Subs 2026" });
  });

  it("is unknown when no renewed opportunity has an end date", () => {
    expect(expectedRenewalStart([])).toBeNull();
    expect(expectedRenewalStart([{ name: "No dates" }, { name: "Bad", subsEndDate: "31/01/2027" }])).toBeNull();
  });

  it("words the warning when the quote starts another day", () => {
    expect(renewalStartWarning("2027-03-01", { date: "2027-02-01", fromName: "APIM Subs 2026" })).toBe(
      "Starts 1 Mar 2027, not 1 Feb 2027, the day after APIM Subs 2026 ends",
    );
  });
});
