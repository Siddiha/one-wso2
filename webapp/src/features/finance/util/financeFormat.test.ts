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

import { describe, it, expect } from "vitest";
import { money } from "./financeFormat";

// Finance read these columns across entities and found the same screen showing
// "$100.00" next to "CAD 100.00", because only four currencies had a symbol
// mapped. Every amount now carries its ISO code instead.
describe("money", () => {
  it("renders the ISO code for the currencies that used to show a symbol", () => {
    expect(money(100, "USD")).toBe("USD 100.00");
    expect(money(100, "GBP")).toBe("GBP 100.00");
    expect(money(100, "EUR")).toBe("EUR 100.00");
    expect(money(100, "LKR")).toBe("LKR 100.00");
  });

  it("renders the same shape for the ones that always showed a code", () => {
    expect(money(100, "CAD")).toBe("CAD 100.00");
    expect(money(100, "AUD")).toBe("AUD 100.00");
    expect(money(100, "INR")).toBe("INR 100.00");
  });

  // "$" cannot say which dollar, and USD, CAD and AUD all appear in this data.
  it("tells the three dollar currencies apart", () => {
    const rendered = [money(1, "USD"), money(1, "CAD"), money(1, "AUD")];
    expect(new Set(rendered).size).toBe(3);
    expect(rendered.every((r) => !r.includes("$"))).toBe(true);
  });

  it("keeps two decimals and thousand separators", () => {
    expect(money(1234567.5, "USD")).toBe("USD 1,234,567.50");
    expect(money(0, "USD")).toBe("USD 0.00");
  });

  it("treats a missing or non-finite amount as zero rather than rendering NaN", () => {
    expect(money(null, "USD")).toBe("USD 0.00");
    expect(money(undefined, "USD")).toBe("USD 0.00");
    expect(money(Number.NaN, "USD")).toBe("USD 0.00");
  });

  it("defaults to LKR when no currency is given", () => {
    expect(money(100)).toBe("LKR 100.00");
  });
});
