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
import { authedPost } from "@api/http";
import { useAccessToken } from "@hooks/useAccessToken";
import { expenseServiceUrls, isExpenseBackendConfigured } from "@config/apiConfig";
import { foldIdentityError, useAsgardeoSub } from "@hooks/useAsgardeoSub";
import { financeRetry } from "../../util/financeError";
import { useExpenseAppData } from "../useExpense";
import type { HistoryAppData, HistoryClaim, HistorySearchPayload } from "./expenseHistoryTypes";

/**
 * POST /search-claims for this screen.
 *
 * A near-copy of the shared `useExpenseClaims` rather than a wrapper around it,
 * for three reasons: its parameter type has no `submissionScope` and its result
 * has no `submittedBy`, so both would need casts that defeat type-checking; and
 * its cache key is shared with the approvals screens, which should not have a
 * history-shaped payload appear in their namespace.
 */
export function useExpenseHistoryClaims(payload: HistorySearchPayload, enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const { state: subState, retry: retryIdentity } = useAsgardeoSub();
  const userSub = subState.status === "ready" ? subState.sub : undefined;
  const configured = isExpenseBackendConfigured();
  const query = useQuery<HistoryClaim[]>({
    queryKey: ["expense-history-claims", userSub, payload],
    enabled: enabled && isSignedIn && configured && Boolean(userSub),
    queryFn: async () => {
      const accessToken = await getAccessToken();
      // The response IS the array — there is no `{ body: [...] }` wrapper.
      const res = await authedPost<HistoryClaim[]>(
        expenseServiceUrls.searchClaims,
        accessToken,
        payload,
      );
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60 * 1000,
    retry: financeRetry,
  });
  return foldIdentityError(query, subState, retryIdentity);
}

/**
 * The same `/app-data` query the rest of the expense app runs — same cache
 * entry, so this screen costs no extra request — read back with the
 * `onBehalfOfEmployees` field the submission-scope filter depends on.
 */
export function useExpenseHistoryAppData() {
  const query = useExpenseAppData();
  return { ...query, data: query.data as HistoryAppData | undefined };
}
