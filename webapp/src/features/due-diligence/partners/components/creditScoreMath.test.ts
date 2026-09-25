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
import { convertToDollars } from "./creditScoreMath";

describe("convertToDollars", () => {
  it("divides every field except companyId/year/exchangeRate by the rate", () => {
    expect(
      convertToDollars({ companyId: 1, year: 1, exchangeRate: 2, currentAssets: 1000, profit: 50 }),
    ).toEqual({ companyId: 1, year: 1, exchangeRate: 2, currentAssets: 500, profit: 25 });
  });

  it("returns the object unchanged for a zero rate, instead of Infinity", () => {
    const input = { exchangeRate: 0, currentAssets: 1000 };
    expect(convertToDollars(input)).toEqual(input);
  });

  it("returns the object unchanged for a negative rate", () => {
    const input = { exchangeRate: -5, currentAssets: 1000 };
    expect(convertToDollars(input)).toEqual(input);
  });

  // WorkingsForRatios' USD table gate has to check this same condition —
  // parseFloat("1e309") is a real value a text field can produce.
  it("returns the object unchanged for a non-finite rate", () => {
    const input = { exchangeRate: Infinity, currentAssets: 1000 };
    expect(convertToDollars(input)).toEqual(input);
  });

  it("returns the object unchanged for a missing/blank rate", () => {
    const input = { exchangeRate: "", currentAssets: 1000 };
    expect(convertToDollars(input)).toEqual(input);
  });
});
