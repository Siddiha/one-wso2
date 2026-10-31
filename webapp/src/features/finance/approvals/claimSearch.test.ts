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
import {
  buildEntityOptions,
  matchesClaimSearch,
  showsKind,
  type SearchableClaim,
} from "./claimSearch";

const claim: SearchableClaim = {
  id: "EXP-2026-0481",
  employeeEmail: "yukthi@wso2.com",
  totalAmount: 13325.91,
};

const nameFor = (email: string) => (email === "yukthi@wso2.com" ? "Yukthi Lochana" : email);

describe("matchesClaimSearch", () => {
  // A blank box must not hide anything — the queue opens unfiltered.
  it("matches every claim when the term is empty or only spaces", () => {
    expect(matchesClaimSearch(claim, "")).toBe(true);
    expect(matchesClaimSearch(claim, "   ")).toBe(true);
  });

  it("finds a claim by its id, in any case", () => {
    expect(matchesClaimSearch(claim, "EXP-2026-0481")).toBe(true);
    expect(matchesClaimSearch(claim, "exp-2026")).toBe(true);
    expect(matchesClaimSearch(claim, "0481")).toBe(true);
  });

  it("finds a claim by the claimant's email", () => {
    expect(matchesClaimSearch(claim, "yukthi@wso2.com")).toBe(true);
    expect(matchesClaimSearch(claim, "YUKTHI")).toBe(true);
  });

  // The row shows the email, but Finance reads these queues by person.
  it("finds a claim by the claimant's display name", () => {
    expect(matchesClaimSearch(claim, "Lochana", nameFor)).toBe(true);
    expect(matchesClaimSearch(claim, "lochana")).toBe(false);
  });

  it("finds a claim by amount, with or without the decimals", () => {
    expect(matchesClaimSearch(claim, "13325.91")).toBe(true);
    expect(matchesClaimSearch(claim, "13325")).toBe(true);
  });

  // The amount renders grouped, so that is how it gets typed back.
  it("finds a claim by an amount typed with thousand separators", () => {
    expect(matchesClaimSearch(claim, "13,325")).toBe(true);
  });

  // Nothing on the row shows the entity, but a reader after "the Lanka ones"
  // reaches for the search box before the Advanced Filter.
  it("finds a claim by the claimant's legal entity", () => {
    const entityFor = () => "WSO2 Lanka (Pvt) Ltd WSO2 - SRI LANKA";
    expect(matchesClaimSearch(claim, "Lanka", undefined, entityFor)).toBe(true);
    expect(matchesClaimSearch(claim, "WSO2 Lanka", undefined, entityFor)).toBe(true);
    // The HRIS code works too, for anyone who thinks in codes.
    expect(matchesClaimSearch(claim, "SRI LANKA", undefined, entityFor)).toBe(true);
    // And it does not match an entity the claimant is not in.
    expect(matchesClaimSearch(claim, "Germany", undefined, entityFor)).toBe(false);
  });

  it("still works when no entity resolver is given", () => {
    expect(matchesClaimSearch(claim, "Lanka")).toBe(false);
    expect(matchesClaimSearch(claim, "EXP-2026-0481")).toBe(true);
  });

  it("rejects a term that appears in no field", () => {
    expect(matchesClaimSearch(claim, "zzz")).toBe(false);
    expect(matchesClaimSearch(claim, "99999")).toBe(false);
  });

  // nameFor returning the email as its fallback must not crash or widen the match.
  it("works without a name resolver", () => {
    expect(matchesClaimSearch(claim, "yukthi")).toBe(true);
    expect(matchesClaimSearch(claim, "Lochana")).toBe(false);
  });
});

describe("showsKind", () => {
  it("shows both groups under All", () => {
    expect(showsKind("all", "opd")).toBe(true);
    expect(showsKind("all", "expense")).toBe(true);
  });

  it("shows only the chosen type otherwise", () => {
    expect(showsKind("opd", "opd")).toBe(true);
    expect(showsKind("opd", "expense")).toBe(false);
    expect(showsKind("expense", "expense")).toBe(true);
    expect(showsKind("expense", "opd")).toBe(false);
  });
});

// Finance filtered by currency because nothing better existed, which cannot
// tell WSO2 Germany GmbH from the Spain entity — both EUR. The dropdown is
// built from the subsidiaries master data instead.
describe("buildEntityOptions", () => {
  const subsidiaries = [
    { code: "WSO2 - SRI LANKA", legalName: "WSO2 Lanka (Pvt) Ltd", country: "Sri Lanka" },
    { code: "WSO2 - UK", legalName: "WSO2 (UK) LIMITED", country: "United Kingdom" },
    { code: "WSO2 - SPAIN", legalName: "WSO2 (UK) LIMITED", country: "Spain" },
    { code: "WSO2 - DORMANT", legalName: "Nobody Works Here Ltd", country: "Narnia" },
  ];

  it("offers the legal name for each entity people are actually in", () => {
    const options = buildEntityOptions(["WSO2 - SRI LANKA"], subsidiaries);
    expect(options).toEqual([{ code: "WSO2 - SRI LANKA", label: "WSO2 Lanka (Pvt) Ltd" }]);
  });

  // 31 subsidiary rows exist, most of them test data or dormant; offering all
  // of them would bury the handful that can match anything.
  it("leaves out entities nobody in the queue belongs to", () => {
    const options = buildEntityOptions(["WSO2 - SRI LANKA"], subsidiaries);
    expect(options.map((o) => o.code)).not.toContain("WSO2 - DORMANT");
  });

  // The trap: two codes, one legal name. Keyed on name they would collapse into
  // a single ambiguous choice.
  it("keeps two subsidiaries sharing a legal name apart", () => {
    const options = buildEntityOptions(["WSO2 - UK", "WSO2 - SPAIN"], subsidiaries);
    expect(options.map((o) => o.code).sort()).toEqual(["WSO2 - SPAIN", "WSO2 - UK"]);
    expect(options.map((o) => o.label).sort()).toEqual([
      "WSO2 (UK) LIMITED (Spain)",
      "WSO2 (UK) LIMITED (United Kingdom)",
    ]);
  });

  // Real in this data: WSO2 - SG and WSO2 - SOUTH AFRICA have no subsidiary row.
  it("still offers a company code the master data has no row for", () => {
    const options = buildEntityOptions(["WSO2 - SG"], subsidiaries);
    expect(options).toEqual([{ code: "WSO2 - SG", label: "WSO2 - SG" }]);
  });

  it("ignores empty codes and deduplicates", () => {
    const options = buildEntityOptions(["WSO2 - UK", "WSO2 - UK", ""], subsidiaries);
    expect(options).toHaveLength(1);
  });

  it("survives the subsidiary list not having loaded yet", () => {
    expect(buildEntityOptions(["WSO2 - UK"], undefined)).toEqual([
      { code: "WSO2 - UK", label: "WSO2 - UK" },
    ]);
  });
});
