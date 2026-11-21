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

// Narrowing for the Invoice Account Mappings table.
//
// Applied to the rows the screen is holding rather than sent to the backend.
// The search endpoint takes the same filters — see `InvoiceAccountMappingFilter`
// in masterDataTypes — so this moves server-side by passing the filter through
// instead of mapping it; what is here is the browser-side half.
//
// Status is deliberately not one of these filters. A reader wants the active
// mappings almost every time, so it is a single "Show Inactive" switch beside
// the table instead of a value buried in a panel that has to be opened first.

import {
  MASTER_DATA_STATUS,
  type InvoiceAccountMapping,
  type InvoiceAccountMappingAutoComplete,
} from "./masterDataTypes";

/** Each key narrows the rows, and the values within one key are an OR. */
export interface InvoiceMappingFilter {
  costTypes?: string[];
  engagementCodes?: string[];
  engagementCodeSuffixes?: string[];
  departments?: string[];
}

/**
 * Stands in for a row that carries no department.
 *
 * A real value rather than a gap — the Intercompany mappings are filed with
 * no department on purpose — so it has to be selectable. The backend spells
 * the same thing as an empty string; this is only how the option reads.
 */
export const NO_DEPARTMENT = "(None)";

/** The values each filter can offer. */
export interface InvoiceMappingFilterOptions {
  costTypes: string[];
  engagementCodes: string[];
  engagementCodeSuffixes: string[];
  departments: string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** A row's department as the filter names it, blank included. */
function departmentOf(mapping: InvoiceAccountMapping): string {
  const department = mapping.department?.trim() ?? "";
  return department.length > 0 ? department : NO_DEPARTMENT;
}

/** Whether a row is active, however its casing was written. */
export function isActiveMapping(mapping: InvoiceAccountMapping): boolean {
  return (mapping.status ?? "").trim().toLowerCase() === MASTER_DATA_STATUS.active;
}

/**
 * The options to offer, preferring what the backend read from the whole table.
 *
 * `lists` comes from `invoice-account-mappings/autocomplete-values`, which
 * reads every row rather than the page on screen — so a code that is not on
 * this page is still offered. Deriving from `rows` is the fallback for the
 * window between first paint and that request landing, and for the case where
 * it fails outright: an empty filter bar would otherwise be the only sign.
 *
 * `NO_DEPARTMENT` is appended rather than read from either source, because
 * neither reports blank as a value — the backend's list excludes it and a
 * page of rows may happen to carry none.
 */
export function getInvoiceMappingFilterOptions(
  rows: readonly InvoiceAccountMapping[],
  lists?: InvoiceAccountMappingAutoComplete,
): InvoiceMappingFilterOptions {
  const fromRows = {
    costTypes: rows.map((row) => row.costType).filter(Boolean),
    engagementCodes: rows.flatMap((row) => row.engagementCodes ?? []),
    engagementCodeSuffixes: rows.flatMap((row) => row.engagementCodeSuffixes ?? []),
    departments: rows.map((row) => row.department?.trim() ?? "").filter(Boolean),
  };
  const costTypes = lists?.costTypes?.map((entry) => entry.label);

  return {
    costTypes: unique(costTypes?.length ? costTypes : fromRows.costTypes),
    engagementCodes: unique(
      lists?.engagementCodes?.length ? lists.engagementCodes : fromRows.engagementCodes,
    ),
    engagementCodeSuffixes: unique(
      lists?.engagementCodeSuffixes?.length
        ? lists.engagementCodeSuffixes
        : fromRows.engagementCodeSuffixes,
    ),
    departments: [
      ...unique(lists?.departments?.length ? lists.departments : fromRows.departments),
      NO_DEPARTMENT,
    ],
  };
}

/** True when nothing is selected, which leaves every row in. */
function keeps(selected: string[] | undefined, held: readonly string[]): boolean {
  if (!selected || selected.length === 0) return true;
  return selected.some((value) => held.includes(value));
}

/**
 * Everything the search box reads, as one lower-cased string.
 *
 * The same columns the backend's `searchTerm` covers, so searching here and
 * searching server-side find the same rows. Deliberately includes the two
 * code lists: the codes are how a mapping is looked up in practice, and they
 * are the thing a reader arrives already knowing.
 */
function searchableText(row: InvoiceAccountMapping): string {
  return [
    row.accountNumber,
    row.accountClassification,
    row.internalId,
    row.costType,
    row.department ?? "",
    ...(row.engagementCodes ?? []),
    ...(row.engagementCodeSuffixes ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/** Whether a row matches the search box, which is blank most of the time. */
function matchesSearch(row: InvoiceAccountMapping, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (term.length === 0) return true;
  // Every whitespace-separated word has to appear somewhere in the row, so
  // "hotel marketing" narrows rather than widening to either one.
  return term.split(/\s+/).every((word) => searchableText(row).includes(word));
}

/**
 * The rows left after the filter bar and the Show Inactive switch.
 *
 * `showInactive` and `search` are separate arguments rather than filter keys,
 * because neither is one: both sit outside the panel, and the panel's Clear
 * button should not empty a search box the reader can see is still full.
 */
export function applyInvoiceMappingFilters(
  rows: readonly InvoiceAccountMapping[],
  filter: InvoiceMappingFilter,
  showInactive = false,
  search = "",
): InvoiceAccountMapping[] {
  return rows.filter(
    (row) =>
      (showInactive || isActiveMapping(row)) &&
      matchesSearch(row, search) &&
      keeps(filter.costTypes, [row.costType]) &&
      keeps(filter.engagementCodes, row.engagementCodes ?? []) &&
      keeps(filter.engagementCodeSuffixes, row.engagementCodeSuffixes ?? []) &&
      keeps(filter.departments, [departmentOf(row)]),
  );
}

/** How many filters are narrowing the table, for the toggle's badge. */
export function countActiveInvoiceMappingFilters(filter: InvoiceMappingFilter): number {
  return Object.values(filter).filter((values) => Array.isArray(values) && values.length > 0).length;
}
