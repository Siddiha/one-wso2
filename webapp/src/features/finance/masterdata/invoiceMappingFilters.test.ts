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
  applyInvoiceMappingFilters,
  countActiveInvoiceMappingFilters,
  getInvoiceMappingFilterOptions,
  isActiveMapping,
  NO_DEPARTMENT,
} from "./invoiceMappingFilters";
import type {
  InvoiceAccountMapping,
  InvoiceAccountMappingAutoComplete,
} from "./masterDataTypes";

// The bar narrows rows already on screen, so every case here is a plain
// input/output assertion over a small table.

const mapping = (over: Partial<InvoiceAccountMapping> & { id: number }): InvoiceAccountMapping => ({
  internalId: "1001",
  accountNumber: "61033-001",
  accountClassification: "Air Ticket",
  engagementCodes: ["RND-GEN-INT"],
  engagementCodeSuffixes: [],
  invCostTypeId: 1,
  costType: "Air Ticket",
  department: "Engineering",
  status: "Active",
  ...over,
});

const ROWS: InvoiceAccountMapping[] = [
  mapping({ id: 1 }),
  mapping({
    id: 2,
    costType: "Currency (per diem / allowances)",
    engagementCodes: ["MKT-GEN-ROT"],
    engagementCodeSuffixes: ["ROT"],
    department: "Marketing",
    status: "Inactive",
  }),
  // Blank department is a real value, not a missing one: the Intercompany
  // rows carry "". Lower-cased status, which some rows written through this
  // screen carry.
  mapping({ id: 3, engagementCodes: ["CS-SUB-IAM"], department: "", status: "active" }),
];

describe("isActiveMapping", () => {
  // The column holds a mix of "Active" and "active" from older writes, so
  // whether a row is active cannot depend on which spelling it carries.
  it("reads either casing as active", () => {
    expect(isActiveMapping(mapping({ id: 1, status: "Active" }))).toBe(true);
    expect(isActiveMapping(mapping({ id: 1, status: "active" }))).toBe(true);
    expect(isActiveMapping(mapping({ id: 1, status: " ACTIVE " }))).toBe(true);
    expect(isActiveMapping(mapping({ id: 1, status: "Inactive" }))).toBe(false);
  });
});

describe("getInvoiceMappingFilterOptions", () => {
  it("offers each cost type once, in name order", () => {
    expect(getInvoiceMappingFilterOptions(ROWS).costTypes).toEqual([
      "Air Ticket",
      "Currency (per diem / allowances)",
    ]);
  });

  it("flattens the engagement codes out of every row", () => {
    expect(getInvoiceMappingFilterOptions(ROWS).engagementCodes).toEqual([
      "CS-SUB-IAM",
      "MKT-GEN-ROT",
      "RND-GEN-INT",
    ]);
  });

  // Blank is not reported by either source — the backend's list excludes it
  // and a page of rows may carry none — so the option is always appended.
  it("always offers the no-department option", () => {
    expect(getInvoiceMappingFilterOptions(ROWS).departments).toContain(NO_DEPARTMENT);
    expect(getInvoiceMappingFilterOptions([]).departments).toEqual([NO_DEPARTMENT]);
  });

  it("has nothing else to offer for no rows", () => {
    const options = getInvoiceMappingFilterOptions([]);
    expect(options.costTypes).toEqual([]);
    expect(options.engagementCodes).toEqual([]);
    expect(options.engagementCodeSuffixes).toEqual([]);
  });

  // This is the point of reading the lists from the backend: once the table
  // is paged, a value that is only on another page still has to be offered,
  // and the rows on screen cannot say so.
  it("prefers the backend lists over the rows on screen", () => {
    const lists: InvoiceAccountMappingAutoComplete = {
      costTypes: [
        { id: 1, label: "Air Ticket" },
        { id: 9, label: "Visa fee" },
      ],
      engagementCodes: ["OFF-PAGE-CODE"],
      engagementCodeSuffixes: ["OFF"],
      departments: ["Cost of Sales"],
    };
    const options = getInvoiceMappingFilterOptions(ROWS, lists);

    expect(options.costTypes).toEqual(["Air Ticket", "Visa fee"]);
    expect(options.engagementCodes).toEqual(["OFF-PAGE-CODE"]);
    expect(options.engagementCodeSuffixes).toEqual(["OFF"]);
    expect(options.departments).toEqual(["Cost of Sales", NO_DEPARTMENT]);
  });

  // The request may not have landed yet, or may have failed outright. An
  // empty filter bar would be the only sign of it, so the rows stand in.
  it("falls back to the rows when a backend list is empty", () => {
    const options = getInvoiceMappingFilterOptions(ROWS, {
      costTypes: [],
      engagementCodes: [],
      engagementCodeSuffixes: [],
      departments: [],
    });
    expect(options.costTypes).toEqual(["Air Ticket", "Currency (per diem / allowances)"]);
    expect(options.engagementCodes).toContain("RND-GEN-INT");
  });
});

describe("applyInvoiceMappingFilters", () => {
  // Status is not a filter but a switch, and it starts off: a retired mapping
  // is looked up on purpose, not browsed past on the way to a live one.
  it("hides the inactive rows unless asked for them", () => {
    expect(applyInvoiceMappingFilters(ROWS, {}).map((row) => row.id)).toEqual([1, 3]);
    expect(applyInvoiceMappingFilters(ROWS, {}, true).map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it("narrows to one cost type", () => {
    const kept = applyInvoiceMappingFilters(ROWS, { costTypes: ["Air Ticket"] }, true);
    expect(kept.map((row) => row.id)).toEqual([1, 3]);
  });

  it("treats several values in one filter as an OR", () => {
    const kept = applyInvoiceMappingFilters(
      ROWS,
      { engagementCodes: ["RND-GEN-INT", "CS-SUB-IAM"] },
      true,
    );
    expect(kept.map((row) => row.id)).toEqual([1, 3]);
  });

  it("treats two filters as an AND", () => {
    const kept = applyInvoiceMappingFilters(
      ROWS,
      { costTypes: ["Air Ticket"], departments: ["Engineering"] },
      true,
    );
    expect(kept.map((row) => row.id)).toEqual([1]);
  });

  // A filter and the switch are an AND too: narrowing to an inactive row's
  // cost type must not bring that row back while the switch is off.
  it("does not let a filter reveal an inactive row", () => {
    const filter = { engagementCodeSuffixes: ["ROT"] };
    expect(applyInvoiceMappingFilters(ROWS, filter)).toEqual([]);
    expect(applyInvoiceMappingFilters(ROWS, filter, true).map((row) => row.id)).toEqual([2]);
  });

  it("finds the rows carrying no department", () => {
    const kept = applyInvoiceMappingFilters(ROWS, { departments: [NO_DEPARTMENT] }, true);
    expect(kept.map((row) => row.id)).toEqual([3]);
  });

  it("matches a suffix on the suffix list, not on the codes", () => {
    expect(
      applyInvoiceMappingFilters(ROWS, { engagementCodeSuffixes: ["RND-GEN-INT"] }, true),
    ).toHaveLength(0);
  });

  it("returns nothing when a selection matches no row", () => {
    expect(applyInvoiceMappingFilters(ROWS, { costTypes: ["Hotel"] }, true)).toEqual([]);
  });
});

describe("the search box", () => {
  const find = (term: string) =>
    applyInvoiceMappingFilters(ROWS, {}, true, term).map((row) => row.id);

  it("leaves every row in when it is blank", () => {
    expect(find("")).toEqual([1, 2, 3]);
    expect(find("   ")).toEqual([1, 2, 3]);
  });

  it("matches the GL code and the account name", () => {
    expect(find("61033-001")).toEqual([1, 2, 3]);
    expect(find("Air Ticket")).toEqual([1, 2, 3]);
  });

  // The codes are how a mapping is looked up in practice, so the search has
  // to reach into both lists rather than only the plain columns.
  it("reaches into the engagement codes and the suffixes", () => {
    expect(find("CS-SUB-IAM")).toEqual([3]);
    expect(find("ROT")).toEqual([2]);
  });

  it("matches the cost type, department and internal ID", () => {
    expect(find("per diem")).toEqual([2]);
    expect(find("Marketing")).toEqual([2]);
    expect(find("1001")).toEqual([1, 2, 3]);
  });

  it("ignores case", () => {
    expect(find("mkt-gen-rot")).toEqual([2]);
  });

  // Otherwise typing a second word would widen the result, which reads as
  // the search getting worse the more you tell it.
  it("narrows on each word rather than widening", () => {
    expect(find("Currency Marketing")).toEqual([2]);
    expect(find("Currency Engineering")).toEqual([]);
  });

  it("finds nothing for a term no row carries", () => {
    expect(find("nonexistent")).toEqual([]);
  });

  // The switch still wins: searching must not surface a retired mapping.
  it("does not reveal an inactive row", () => {
    expect(applyInvoiceMappingFilters(ROWS, {}, false, "MKT-GEN-ROT")).toEqual([]);
  });
});

describe("countActiveInvoiceMappingFilters", () => {
  it("counts only the filters holding a selection", () => {
    expect(countActiveInvoiceMappingFilters({})).toBe(0);
    expect(countActiveInvoiceMappingFilters({ costTypes: [] })).toBe(0);
    expect(
      countActiveInvoiceMappingFilters({ costTypes: ["Air Ticket"], departments: ["Marketing"] }),
    ).toBe(2);
  });
});
