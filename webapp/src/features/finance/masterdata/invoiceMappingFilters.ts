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
// The narrowing is done by the backend, not here: this turns what the filter
// bar, the search box and the Show Inactive switch are holding into the
// `InvoiceAccountMappingFilter` the search endpoint takes. Filtering the rows
// in the browser would only ever narrow the page already fetched, so a value
// on page two could not be found at all — which is the whole reason the
// endpoint pages and counts.
//
// Status is deliberately not one of the bar's filters. A reader wants the
// active mappings almost every time, so it is a single "Show Inactive" switch
// beside the table instead of a value buried in a panel that has to be opened
// first.

import {
  MASTER_DATA_STATUS,
  type InvoiceAccountMapping,
  type InvoiceAccountMappingAutoComplete,
  type InvoiceAccountMappingFilter,
  type LabelledId,
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

/** What the screen is holding, as one argument rather than five positional ones. */
export interface InvoiceMappingRequestInput {
  filter: InvoiceMappingFilter;
  showInactive: boolean;
  search: string;
  /** Cost types as the autocomplete lists them, to turn a label into its id. */
  costTypes?: LabelledId[];
  page: number;
  pageSize: number;
}

/**
 * The filter the search endpoint takes, and whether it can be asked yet.
 *
 * `ready` is false only while a cost type is selected whose id is not known —
 * the autocomplete has not landed, or failed. Sending the request anyway
 * would drop `invCostTypeIds` and so return MORE rows than the reader asked
 * for, which is the one way a filter must never fail.
 */
export interface InvoiceMappingRequest {
  request: InvoiceAccountMappingFilter;
  ready: boolean;
}

/** Turn the screen's state into the search endpoint's filter. */
export function toInvoiceMappingRequest({
  filter,
  showInactive,
  search,
  costTypes,
  page,
  pageSize,
}: InvoiceMappingRequestInput): InvoiceMappingRequest {
  const selectedCostTypes = filter.costTypes ?? [];
  const byLabel = new Map((costTypes ?? []).map((entry) => [entry.label, entry.id]));
  const invCostTypeIds = selectedCostTypes
    .map((label) => byLabel.get(label))
    .filter((id): id is number => id !== undefined);

  // `NO_DEPARTMENT` is how the option reads; the backend spells the same
  // thing as an empty string, and treats it as "no department on the row".
  const departments = (filter.departments ?? []).map((value) =>
    value === NO_DEPARTMENT ? "" : value,
  );
  const term = search.trim();

  return {
    ready: invCostTypeIds.length === selectedCostTypes.length,
    request: {
      ...(invCostTypeIds.length > 0 ? { invCostTypeIds } : {}),
      ...(filter.engagementCodes?.length ? { engagementCodes: filter.engagementCodes } : {}),
      ...(filter.engagementCodeSuffixes?.length
        ? { engagementCodeSuffixes: filter.engagementCodeSuffixes }
        : {}),
      ...(departments.length > 0 ? { departments } : {}),
      // Omitted rather than sent as both values: no status filter is already
      // every status, and the two spellings would only be a longer way of
      // asking the same question.
      ...(showInactive ? {} : { status: [MASTER_DATA_STATUS.active] }),
      ...(term.length > 0 ? { searchTerm: term } : {}),
      limit: pageSize,
      offset: page * pageSize,
    },
  };
}

/** How many filters are narrowing the table, for the toggle's badge. */
export function countActiveInvoiceMappingFilters(filter: InvoiceMappingFilter): number {
  return Object.values(filter).filter((values) => Array.isArray(values) && values.length > 0).length;
}
