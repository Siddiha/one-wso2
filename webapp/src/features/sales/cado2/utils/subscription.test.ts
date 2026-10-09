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
import { NO_SUBSCRIPTION_DATES, subscriptionLine, subscriptionPeriod } from "./subscription";

describe("subscription wording", () => {
  it("words the period, including only one of the two dates", () => {
    expect(subscriptionPeriod({ subsStartDate: "2027-02-01", subsEndDate: "2028-01-31" })).toBe("1 Feb 2027 – 31 Jan 2028");
    expect(subscriptionPeriod({ subsStartDate: "2027-02-01", subsEndDate: null })).toBe("From 1 Feb 2027");
    expect(subscriptionPeriod({ subsStartDate: null, subsEndDate: "2028-01-31" })).toBe("Until 31 Jan 2028");
    expect(subscriptionPeriod({ subsStartDate: null, subsEndDate: null })).toBe(NO_SUBSCRIPTION_DATES);
  });

  it("words the line under an opportunity's name", () => {
    expect(subscriptionLine({ subsStartDate: "2027-02-01", subsEndDate: "2028-01-31" })).toBe("Subscription 1 Feb 2027 – 31 Jan 2028");
    expect(subscriptionLine({ subsStartDate: null, subsEndDate: "2028-01-31" })).toBe("Subscription until 31 Jan 2028");
    expect(subscriptionLine({ subsStartDate: "2027-02-01" })).toBe("Subscription from 1 Feb 2027");
    expect(subscriptionLine({ subsStartDate: null, subsEndDate: null })).toBe(NO_SUBSCRIPTION_DATES);
    expect(subscriptionLine({})).toBeNull(); // not known at all
  });
});
