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
import { authedGet } from "@api/http";
import { useAccessToken } from "@hooks/useAccessToken";
import { ccServiceUrls, isCcBackendConfigured } from "@config/apiConfig";
import { foldIdentityError, useAsgardeoSub } from "@hooks/useAsgardeoSub";
import { financeRetry } from "../util/financeError";
import { daysAgoIso, tomorrowIso } from "../util/financeFormat";
import type {
  CcCreditCard,
  CcEmployee,
  CcExpenseTypeList,
  CcCardHolderCompliance,
  CcManagerCompliance,
  CcCategoryMonthAmount,
  CcJobNumberDetails,
  CcLeadApprovalSummary,
  CcLeadTeamCardHolder,
  CcLeadTeamUnsubmittedSummary,
  CcJobNumberList,
  CcTransactionSummary,
  CcProductAndBusinessUnitList,
  CcSubRegionList,
  CcTransaction,
} from "./ccTypes";

export { isCcBackendConfigured };

export function useCcUserInfo(enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const { state: subState, retry: retryIdentity } = useAsgardeoSub();
  const userSub = subState.status === "ready" ? subState.sub : undefined;
  const configured = isCcBackendConfigured();
  const query = useQuery<CcEmployee>({
    queryKey: ["cc-user-info", userSub],
    enabled: enabled && isSignedIn && configured && Boolean(userSub),
    queryFn: async () => {
      const accessToken = await getAccessToken();
      return authedGet<CcEmployee>(ccServiceUrls.userInfo, accessToken);
    },
    staleTime: 5 * 60 * 1000,
    retry: financeRetry,
  });
  return foldIdentityError(query, subState, retryIdentity);
}

export function useCreditCards(includeInactive = false) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const { state: subState, retry: retryIdentity } = useAsgardeoSub();
  const userSub = subState.status === "ready" ? subState.sub : undefined;
  const configured = isCcBackendConfigured();
  const query = useQuery<CcCreditCard[]>({
    queryKey: ["cc-cards", userSub, includeInactive],
    enabled: isSignedIn && configured && Boolean(userSub),
    queryFn: async () => {
      const accessToken = await getAccessToken();
      const cards = await authedGet<CcCreditCard[]>(ccServiceUrls.creditCards, accessToken);
      // creditCard.ts:57-62 keeps only active cards unless asked otherwise.
      // The flag was already in the cache key here but never applied, so a
      // closed card still appeared in the picker.
      if (includeInactive) return cards;
      return (cards ?? []).filter((c) => (c.status ?? "").toUpperCase() === "ACTIVE");
    },
    staleTime: 5 * 60 * 1000,
    retry: financeRetry,
  });
  return foldIdentityError(query, subState, retryIdentity);
}

// GET /transactions?dateFrom&dateTo&includeInactive — scoped server-side by
// the caller's privileges + email. The backend REQUIRES dateFrom/dateTo.
//
// utils.ts:21-33 — fetchTransactions defaults to `range || 7`, and New /
// Pending / Approve all call it with no range. Those screens work off recent
// statement activity; History is where an older window is chosen explicitly.
const DEFAULT_WINDOW_DAYS = 7;

export function useCcTransactions(
  opts: { dateFrom?: string; dateTo?: string; includeInactive?: boolean } = {},
) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const { state: subState, retry: retryIdentity } = useAsgardeoSub();
  const userSub = subState.status === "ready" ? subState.sub : undefined;
  const configured = isCcBackendConfigured();
  const dateFrom = opts.dateFrom ?? daysAgoIso(DEFAULT_WINDOW_DAYS);
  // utils.ts:21-33 advances the end of the window by a day before formatting.
  // Asking up to today can drop transactions dated today; the source never does.
  const dateTo = opts.dateTo ?? tomorrowIso();
  const includeInactive = opts.includeInactive ?? false;
  const query = useQuery<CcTransaction[]>({
    queryKey: ["cc-transactions", userSub, dateFrom, dateTo, includeInactive],
    enabled: isSignedIn && configured && Boolean(userSub),
    queryFn: async () => {
      const accessToken = await getAccessToken();
      // The backend requires all three query params to be present.
      const p = new URLSearchParams();
      p.set("dateFrom", dateFrom);
      p.set("dateTo", dateTo);
      p.set("includeInactive", String(includeInactive));
      return authedGet<CcTransaction[]>(ccServiceUrls.transactions(`?${p.toString()}`), accessToken);
    },
    staleTime: 30 * 1000,
    retry: financeRetry,
  });
  return foldIdentityError(query, subState, retryIdentity);
}

// The four dropdown sources the submission form needs. Bundled so the form
// mounts one hook.
export function useCcMenus() {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const { state: subState, retry: retryIdentity } = useAsgardeoSub();
  const userSub = subState.status === "ready" ? subState.sub : undefined;
  const configured = isCcBackendConfigured();
  // Scope these to the signed-in user like the other authenticated CC
  // queries: logout only calls Asgardeo signOut() and does not clear the
  // React Query cache, so an in-tab account switch could otherwise serve a
  // prior user's cached responses (job numbers are per-user; the rest are
  // reference data, but keying uniformly keeps the cache clean).
  const enabled = isSignedIn && configured && Boolean(userSub);

  const expenseTypes = useQuery<CcExpenseTypeList>({
    queryKey: ["cc-expense-types", userSub],
    enabled,
    queryFn: async () => authedGet<CcExpenseTypeList>(ccServiceUrls.expenseTypes, await getAccessToken()),
    staleTime: 30 * 60 * 1000,
    retry: financeRetry,
  });
  const subRegions = useQuery<CcSubRegionList>({
    queryKey: ["cc-sub-regions", userSub],
    enabled,
    queryFn: async () => authedGet<CcSubRegionList>(ccServiceUrls.subRegions, await getAccessToken()),
    staleTime: 30 * 60 * 1000,
    retry: financeRetry,
  });
  const units = useQuery<CcProductAndBusinessUnitList>({
    queryKey: ["cc-units", userSub],
    enabled,
    queryFn: async () =>
      authedGet<CcProductAndBusinessUnitList>(ccServiceUrls.productAndBusinessUnits, await getAccessToken()),
    staleTime: 30 * 60 * 1000,
    retry: financeRetry,
  });
  const jobNumbers = useQuery<CcJobNumberList>({
    queryKey: ["cc-job-numbers", userSub],
    enabled,
    queryFn: async () => authedGet<CcJobNumberList>(ccServiceUrls.jobNumbers, await getAccessToken()),
    staleTime: 30 * 60 * 1000,
    retry: financeRetry,
  });

  return {
    expenseTypes: foldIdentityError(expenseTypes, subState, retryIdentity),
    subRegions: foldIdentityError(subRegions, subState, retryIdentity),
    units: foldIdentityError(units, subState, retryIdentity),
    jobNumbers: foldIdentityError(jobNumbers, subState, retryIdentity),
  };
}

/**
 * GET /travels/{jobNumber} — a travel job's engagement details, its units and
 * the funding sources it is charged against. Only fires once a job is chosen.
 *
 * EditPane.tsx:560-600 treats this as the authority for a travel transaction's
 * product and business unit: it copies them onto the row rather than asking
 * the user to pick them.
 */
export function useCcJobNumberDetails(jobNumber: string | undefined) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isCcBackendConfigured();
  return useQuery<CcJobNumberDetails>({
    queryKey: ["cc-job-number-details", jobNumber ?? null],
    enabled: isSignedIn && configured && Boolean(jobNumber),
    queryFn: async () =>
      authedGet<CcJobNumberDetails>(
        ccServiceUrls.jobNumberDetails(jobNumber!),
        await getAccessToken(),
      ),
    staleTime: 10 * 60 * 1000,
    retry: financeRetry,
  });
}

// ---- dashboard ------------------------------------------------------------
//
// Three analytics endpoints, each scoped by `ownedCardsOnly` — dashboard
// /index.tsx:64 sets it when a lead or finance switches to the employee view,
// so they can see their own spend rather than everyone's.

function dashboardQuery<T>(
  key: unknown[],
  url: string,
  enabled: boolean,
  getAccessToken: () => Promise<string>,
) {
  return {
    queryKey: key,
    enabled,
    queryFn: async () => authedGet<T>(url, await getAccessToken()),
    staleTime: 5 * 60 * 1000,
    retry: financeRetry,
  };
}

// transactionSummary.ts:54 spreads each parameter only when it is truthy, so a
// false `ownedCardsOnly` is left off the query string rather than sent as
// "false". Same for an absent `dateFrom` on the "All time" period.
const scoped = (base: string, params: Record<string, string | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== false && v !== "") p.set(k, String(v));
  }
  const q = p.toString();
  return q ? `${base}?${q}` : base;
};

/**
 * Whose numbers a dashboard query is about.
 *
 * `index.tsx:105-127` scopes the same two endpoints three ways: everybody
 * (admin), your own cards (employee), or one lead's team. Passed as one object
 * so a caller cannot ask for two of them at once.
 */
export interface CcDashboardScope {
  ownedCardsOnly: boolean;
  /** Set only in Lead view, once a lead has been picked. */
  leadEmail?: string;
}

export function useCcTransactionSummary(
  dateFrom: string | undefined,
  ownedCardsOnly: boolean,
  leadEmail?: string,
) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isCcBackendConfigured();
  return useQuery<CcTransactionSummary>(
    dashboardQuery<CcTransactionSummary>(
      ["cc-txn-summary", dateFrom ?? null, ownedCardsOnly, leadEmail ?? null],
      scoped(ccServiceUrls.transactionSummary, { dateFrom, ownedCardsOnly, leadEmail }),
      isSignedIn && configured,
      getAccessToken,
    ),
  );
}

export function useCcSubmittedByCategory(
  range: { dateFrom: string; dateTo: string },
  ownedCardsOnly: boolean,
  leadEmail?: string,
) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isCcBackendConfigured();
  return useQuery<CcCategoryMonthAmount[]>(
    dashboardQuery<CcCategoryMonthAmount[]>(
      ["cc-submitted-by-category", range.dateFrom, range.dateTo, ownedCardsOnly, leadEmail ?? null],
      scoped(ccServiceUrls.submittedByCategory, { ...range, ownedCardsOnly, leadEmail }),
      isSignedIn && configured,
      getAccessToken,
    ),
  );
}

export function useCcCardHolderCompliance(
  dateFrom: string | undefined,
  ownedCardsOnly: boolean,
  enabled: boolean,
) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isCcBackendConfigured();
  return useQuery<CcCardHolderCompliance[]>(
    dashboardQuery<CcCardHolderCompliance[]>(
      ["cc-cardholder-compliance", dateFrom ?? null, ownedCardsOnly],
      scoped(ccServiceUrls.cardHolderCompliance, { dateFrom, ownedCardsOnly }),
      enabled && isSignedIn && configured,
      getAccessToken,
    ),
  );
}

/** Admin view's "Group by: Reporting Manager" — Finance only, same window as
 *  `useCcCardHolderCompliance`, unscoped by card ownership (it is already
 *  company-wide by nature). */
export function useCcManagerCompliance(dateFrom: string | undefined, enabled: boolean) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isCcBackendConfigured();
  return useQuery<CcManagerCompliance[]>(
    dashboardQuery<CcManagerCompliance[]>(
      ["cc-manager-compliance", dateFrom ?? null],
      scoped(ccServiceUrls.managerCompliance, { dateFrom }),
      enabled && isSignedIn && configured,
      getAccessToken,
    ),
  );
}


/**
 * Every lead's approval backlog — Lead view's overview table, finance only.
 *
 * Takes no window: `index.tsx:139-142` fetches it unscoped, because it answers
 * "who is behind right now", not "what happened in a period".
 */
export function useCcLeadApprovalSummary(enabled: boolean) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isCcBackendConfigured();
  return useQuery<CcLeadApprovalSummary[]>(
    dashboardQuery<CcLeadApprovalSummary[]>(
      ["cc-lead-approval-summary"],
      ccServiceUrls.leadApprovalSummary,
      enabled && isSignedIn && configured,
      getAccessToken,
    ),
  );
}

/** The card holders inside one lead's team, once that lead has been picked. */
export function useCcLeadTeamCardHolders(leadEmail: string | undefined) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isCcBackendConfigured();
  return useQuery<CcLeadTeamCardHolder[]>(
    dashboardQuery<CcLeadTeamCardHolder[]>(
      ["cc-lead-team-cardholders", leadEmail ?? null],
      scoped(ccServiceUrls.leadTeamCardHolders, { leadEmail }),
      Boolean(leadEmail) && isSignedIn && configured,
      getAccessToken,
    ),
  );
}

/**
 * One lead's team's not-yet-submitted summary — average age plus the per-bucket
 * value figures, which the per-card-holder rows (CcLeadViewTables.tsx) don't
 * carry (those only have bucket counts).
 */
export function useCcLeadTeamUnsubmittedSummary(leadEmail: string | undefined) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const configured = isCcBackendConfigured();
  return useQuery<CcLeadTeamUnsubmittedSummary>(
    dashboardQuery<CcLeadTeamUnsubmittedSummary>(
      ["cc-lead-team-unsubmitted-summary", leadEmail ?? null],
      scoped(ccServiceUrls.leadTeamUnsubmittedSummary, { leadEmail }),
      Boolean(leadEmail) && isSignedIn && configured,
      getAccessToken,
    ),
  );
}
