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

import { useQuery } from "@tanstack/react-query";
import { useAsgardeo } from "@asgardeo/react";
import { authedGet, authedPost } from "@api/http";
import { useAccessToken } from "@hooks/useAccessToken";
import {
  financeMasterDataServiceUrls,
  isFinanceMasterDataBackendConfigured,
} from "@config/apiConfig";
import { financeRetry } from "../util/financeError";
import {
  MASTER_DATA_ENDPOINTS,
  type EmployeeEmail,
  type ExpenseType,
  type ExpenseTypeAutoComplete,
  type ExpenseTypeFilter,
  type GlCode,
  type InvoiceCostType,
  type MasterDataRowFor,
  type MasterDataTab,
} from "./masterDataTypes";

export { isFinanceMasterDataBackendConfigured };

/**
 * Reference data, not personal data.
 *
 * Unlike the CC and OPD queries these are not scoped to the signed-in user —
 * every reader of this app sees the same subsidiaries and the same GL codes,
 * so there is nothing per-user to key the cache on and no cross-account
 * leak to guard against. The backend still authorises the request; it just
 * does not vary the answer.
 */
const REFERENCE_STALE_TIME = 5 * 60 * 1000;

/**
 * Alphabetical, case-insensitively and with runs of digits read as numbers.
 *
 * Every picker on this screen is sorted with it, because the backend returns
 * each of these lists in whatever order the rows fall out of the query — no
 * order at all to a reader hunting one name among hundreds.
 *
 * `sensitivity: "base"` keeps a shouted name next to its neighbours rather
 * than bunching every capitalised one at the top — the catalogue carries both
 * "ZENDESK, INC" and "Zopim". `numeric` is what puts a GL code like 61015-9
 * before 61015-10 instead of after it.
 */
const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/**
 * One tab's rows.
 *
 * Three of the four are a plain GET. Expense types go through a POST filter
 * instead, because that table carries six filters rather than none — see
 * `useExpenseTypes` below, which is the hook that screen actually uses.
 */
export function useMasterDataList<T extends Exclude<MasterDataTab, "expenseTypes">>(tab: T) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isFinanceMasterDataBackendConfigured();

  return useQuery<MasterDataRowFor[T][]>({
    queryKey: ["finance-master-data", tab],
    enabled: isSignedIn && configured,
    queryFn: async () =>
      authedGet<MasterDataRowFor[T][]>(
        financeMasterDataServiceUrls.collection(MASTER_DATA_ENDPOINTS[tab]),
        await getAccessToken(),
      ),
    staleTime: REFERENCE_STALE_TIME,
    retry: financeRetry,
  });
}

/**
 * Expense types matching a filter — POST `search-expense-types`.
 *
 * An empty `filters` is a real question rather than an absent one: the
 * backend builds no WHERE clause for it and answers with the whole
 * catalogue, which is what the page asks for on its first render.
 */
export function useExpenseTypes(filters: ExpenseTypeFilter, enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isFinanceMasterDataBackendConfigured();

  return useQuery<ExpenseType[]>({
    // The filter object is part of the key, so going back to a previous set
    // of filters is served from cache instead of re-queried.
    queryKey: ["finance-master-data", "expenseTypes", filters],
    enabled: enabled && isSignedIn && configured,
    queryFn: async () => {
      // `authedPost` widens to `T | null` for the endpoints that answer 201
      // with no body. This one always returns rows, and an absent body here
      // means no matches — an empty table, not a failed query.
      const rows = await authedPost<ExpenseType[]>(
        financeMasterDataServiceUrls.searchExpenseTypes,
        await getAccessToken(),
        filters,
      );
      return rows ?? [];
    },
    staleTime: REFERENCE_STALE_TIME,
    retry: financeRetry,
  });
}

/**
 * The GL codes the department form's dropdown offers.
 *
 * Fetched by the page rather than by the dialog. The source loads it inside
 * `DepartmentFormContent` on mount and shows a spinner over the whole dialog
 * until it lands, so opening the form is a wait every single time; React
 * Query caches it across opens, which is the same request made once.
 */
export function useGlCodes(enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isFinanceMasterDataBackendConfigured();

  return useQuery<GlCode[]>({
    queryKey: ["finance-master-data", "gl-codes"],
    enabled: enabled && isSignedIn && configured,
    queryFn: async () => {
      const rows = await authedGet<GlCode[]>(
        financeMasterDataServiceUrls.glCodes,
        await getAccessToken(),
      );
      // By the code itself, which is what the picker shows and what someone
      // scanning the list is reading down.
      return [...(rows ?? [])].sort((a, b) => byName(a.glCode, b.glCode));
    },
    staleTime: 30 * 60 * 1000,
    retry: financeRetry,
  });
}

/** Work emails, for the card form's Employee and Lead pickers. */
export function useEmployeeEmails(enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isFinanceMasterDataBackendConfigured();

  return useQuery<string[]>({
    queryKey: ["finance-master-data", "employee-emails"],
    enabled: enabled && isSignedIn && configured,
    queryFn: async () => {
      const rows = await authedGet<EmployeeEmail[]>(
        financeMasterDataServiceUrls.employeeEmails,
        await getAccessToken(),
      );
      return (rows ?? []).map((r) => r.workEmail).sort(byName);
    },
    staleTime: 30 * 60 * 1000,
    retry: financeRetry,
  });
}

/**
 * Every option list in one payload, alphabetised.
 *
 * Exported for its own test: the hook around it needs a signed-in Asgardeo
 * and a query client to exercise, and neither has anything to do with the
 * ordering this decides.
 */
export function sortAutoCompleteLists(lists: ExpenseTypeAutoComplete): ExpenseTypeAutoComplete {
  return {
    expenseCategoryIds: [...(lists.expenseCategoryIds ?? [])].sort((a, b) =>
      byName(a.label, b.label),
    ),
    glCodeIds: [...(lists.glCodeIds ?? [])].sort((a, b) => byName(a.label, b.label)),
    expenseTypes: [...(lists.expenseTypes ?? [])].sort(byName),
    engagementCodes: [...(lists.engagementCodes ?? [])].sort(byName),
    engagementCodeSuffixes: [...(lists.engagementCodeSuffixes ?? [])].sort(byName),
  };
}

/**
 * The option lists behind the expense-type filters AND that tab's form.
 *
 * One request serves both, so the category and GL-code pickers inside the
 * dialog are populated from the same payload that fills the filter bar.
 *
 * Sorted once on arrival rather than at either render site, so the filter bar
 * and the dialog show the same order.
 */
export function useExpenseTypeAutoComplete(enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isFinanceMasterDataBackendConfigured();

  return useQuery<ExpenseTypeAutoComplete>({
    queryKey: ["finance-master-data", "expense-type-autocomplete"],
    enabled: enabled && isSignedIn && configured,
    queryFn: async () =>
      sortAutoCompleteLists(
        await authedGet<ExpenseTypeAutoComplete>(
          financeMasterDataServiceUrls.expenseTypeAutocomplete,
          await getAccessToken(),
        ),
      ),
    staleTime: 30 * 60 * 1000,
    retry: financeRetry,
  });
}

/**
 * The cost types an invoice account mapping may be filed under.
 *
 * Eight fixed rows in the Travel app's `inv_cost_type`, one of which —
 * "Currency (per diem / allowances)" — is what makes a mapping a per diem
 * mapping rather than a travel invoice one. Sorted by name on arrival so the
 * picker reads in one order wherever it is shown.
 */
export function useInvoiceCostTypes(enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isFinanceMasterDataBackendConfigured();

  return useQuery<InvoiceCostType[]>({
    queryKey: ["finance-master-data", "invoice-cost-types"],
    enabled: enabled && isSignedIn && configured,
    queryFn: async () => {
      const rows = await authedGet<InvoiceCostType[]>(
        financeMasterDataServiceUrls.invoiceCostTypes,
        await getAccessToken(),
      );
      return [...(rows ?? [])].sort((a, b) => byName(a.name, b.name));
    },
    // A lookup table, not a maintained one: it changes when Travel ships.
    staleTime: 30 * 60 * 1000,
    retry: financeRetry,
  });
}

/**
 * The countries a subsidiary may be registered in, and the currency each
 * reimburses in.
 */
export function useCountries(enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isFinanceMasterDataBackendConfigured();

  return useQuery<Record<string, string>>({
    queryKey: ["finance-master-data", "countries"],
    enabled: enabled && isSignedIn && configured,
    queryFn: async () =>
      authedGet<Record<string, string>>(
        financeMasterDataServiceUrls.countries,
        await getAccessToken(),
      ),
    // Fixed reference data; it changes when the service ships, not in session.
    staleTime: Infinity,
    retry: financeRetry,
  });
}
