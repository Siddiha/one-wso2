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

import type {
  ExpenseAppData,
  ExpenseClaim,
  ExpenseClaimSearchPayload,
  ExpenseClaimStatus,
} from "../expenseTypes";

/**
 * `/search-claims` returns `submittedBy` alongside `employeeEmail` — who filed
 * the claim, as opposed to who it is for. The shared `ExpenseClaim` does not
 * name it because the Me-side screens never differ on it, so this view adds it
 * rather than widening the type the approvals screens also depend on.
 */
export interface HistoryClaim extends ExpenseClaim {
  submittedBy?: string | null;
}

// utils/types.ts:32-36 in the source app. These strings go on the wire, so
// they are copied verbatim rather than renamed to portal conventions.
export const CLAIM_SUBMISSION_SCOPES = ["ALL_CLAIMS", "OWN_ONLY", "SUBMITTED_ON_BEHALF"] as const;
export type ClaimSubmissionScope = (typeof CLAIM_SUBMISSION_SCOPES)[number];

export function submissionScopeLabel(scope: ClaimSubmissionScope): string {
  switch (scope) {
    case "OWN_ONLY":
      return "My Claims Only";
    case "SUBMITTED_ON_BEHALF":
      return "Submitted on Behalf";
    default:
      return "All";
  }
}

export interface HistorySearchPayload extends ExpenseClaimSearchPayload {
  submissionScope?: ClaimSubmissionScope;
}

/** `/app-data` also carries who this person may file for — see the submitter view. */
export interface HistoryAppData extends ExpenseAppData {
  onBehalfOfEmployees?: string[];
}

// FilterHolder.tsx:40 — the range dropdown is two options, not a year list.
export const CLAIM_RANGE_LATEST = "Latest 100";
export const CLAIM_RANGE_CUSTOM = "Custom Date";
export type ClaimRange = typeof CLAIM_RANGE_LATEST | typeof CLAIM_RANGE_CUSTOM;

/** A filter set as the page holds it, before it becomes a search payload. */
export interface HistoryFilters {
  range: ClaimRange;
  /** Both set, or both empty — a half-filled range is never applied. */
  startDate: string;
  endDate: string;
  status: ExpenseClaimStatus | "All";
  claimId: string;
  submissionScope: ClaimSubmissionScope;
}

export const EMPTY_HISTORY_FILTERS: HistoryFilters = {
  range: CLAIM_RANGE_LATEST,
  startDate: "",
  endDate: "",
  status: "All",
  claimId: "",
  submissionScope: "ALL_CLAIMS",
};

/**
 * utils.ts#isOnBehalfOfClaim — a claim filed by someone other than the person
 * it belongs to. `submittedBy` is absent on older records, which read as own.
 */
export function isOnBehalfOfClaim(claim: HistoryClaim): boolean {
  return Boolean(claim.submittedBy) && claim.submittedBy !== claim.employeeEmail;
}

/**
 * tableSlice.ts:40-52 — the search body. Fields are OMITTED rather than sent
 * empty; the backend treats an empty array differently from an absent one.
 */
export function toHistorySearchPayload(
  filters: HistoryFilters,
  email: string | undefined,
): HistorySearchPayload {
  const custom = filters.range === CLAIM_RANGE_CUSTOM && filters.startDate && filters.endDate;
  return {
    email,
    submissionScope: filters.submissionScope,
    ids: filters.claimId ? [filters.claimId] : undefined,
    // "Latest 100" caps the list and sends no dates; a custom range does the
    // opposite. They are never combined.
    limit: filters.range === CLAIM_RANGE_LATEST ? 100 : undefined,
    startDate: custom ? filters.startDate : undefined,
    endDate: custom ? filters.endDate : undefined,
    status: filters.status === "All" ? undefined : [filters.status],
  };
}
