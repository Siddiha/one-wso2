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
  countActiveInvoiceMappingFilters,
  getInvoiceMappingFilterOptions,
  NO_DEPARTMENT,
  toInvoiceMappingRequest,
} from "./invoiceMappingFilters";
import type {
  InvoiceAccountMapping,
  InvoiceAccountMappingAutoComplete,
} from "./masterDataTypes";

// The bar no longer narrows rows on screen — it builds the filter the search
// endpoint is asked with — so the cases below are about the request that comes
// out of it, plus the option lists the bar offers.

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

describe("toInvoiceMappingRequest", () => {
  const COST_TYPES = [
    { id: 1, label: "Air Ticket" },
    { id: 4, label: "Currency (per diem / allowances)" },
  ];
  const build = (over: Partial<Parameters<typeof toInvoiceMappingRequest>[0]> = {}) =>
    toInvoiceMappingRequest({
      filter: {},
      showInactive: false,
      search: "",
      costTypes: COST_TYPES,
      page: 0,
      pageSize: 100,
      ...over,
    });

  // An empty filter is a real question — "all of them" — so the request
  // carries only the page, and the endpoint builds no WHERE clause for it.
  it("asks for the first page and nothing else when nothing is selected", () => {
    expect(build({ showInactive: true }).request).toEqual({ limit: 100, offset: 0 });
  });

  it("turns the page into a limit and an offset", () => {
    expect(build({ page: 3, pageSize: 25 }).request).toMatchObject({ limit: 25, offset: 75 });
  });

  // Status is the switch, not a filter: off means active only, and on asks
  // for everything rather than for both spellings.
  it("sends the active status only while Show Inactive is off", () => {
    expect(build().request.status).toEqual(["active"]);
    expect(build({ showInactive: true }).request.status).toBeUndefined();
  });

  it("maps a cost type label to the id the endpoint filters on", () => {
    const { request, ready } = build({ filter: { costTypes: ["Air Ticket"] } });
    expect(request.invCostTypeIds).toEqual([1]);
    expect(ready).toBe(true);
  });

  // The one failure that must not widen the table. With the labels on screen
  // but their ids not yet known, dropping `invCostTypeIds` would return every
  // cost type — so the request is held instead.
  it("is not ready while a selected cost type has no id yet", () => {
    const { request, ready } = build({
      filter: { costTypes: ["Air Ticket"] },
      costTypes: undefined,
    });
    expect(ready).toBe(false);
    expect(request.invCostTypeIds).toBeUndefined();
  });

  it("is not ready when only some of the selected cost types resolve", () => {
    expect(build({ filter: { costTypes: ["Air Ticket", "Hotel"] } }).ready).toBe(false);
  });

  // Blank is a real department, carried on purpose by the Intercompany rows.
  // The option reads "(None)"; the endpoint spells it as an empty string.
  it("sends no department as an empty string", () => {
    expect(build({ filter: { departments: [NO_DEPARTMENT] } }).request.departments).toEqual([""]);
    expect(
      build({ filter: { departments: ["Marketing", NO_DEPARTMENT] } }).request.departments,
    ).toEqual(["Marketing", ""]);
  });

  it("passes the code lists through untouched", () => {
    const { request } = build({
      filter: { engagementCodes: ["RND-GEN-INT"], engagementCodeSuffixes: ["ROT"] },
    });
    expect(request.engagementCodes).toEqual(["RND-GEN-INT"]);
    expect(request.engagementCodeSuffixes).toEqual(["ROT"]);
  });

  // An empty array is the same question as no filter at all, and leaving the
  // key in would have the endpoint build a condition that matches nothing.
  it("leaves an empty selection out of the request entirely", () => {
    const { request } = build({
      filter: { costTypes: [], engagementCodes: [], departments: [] },
      showInactive: true,
    });
    expect(request).toEqual({ limit: 100, offset: 0 });
  });

  it("trims the search term and omits a blank one", () => {
    expect(build({ search: "  MKT-GEN  " }).request.searchTerm).toBe("MKT-GEN");
    expect(build({ search: "   " }).request.searchTerm).toBeUndefined();
    expect(build({ search: "" }).request.searchTerm).toBeUndefined();
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
