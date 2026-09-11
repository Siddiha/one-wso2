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

import { useMemo, useState } from "react";
import { Box, Skeleton, Stack, Typography } from "@wso2/oxygen-ui";
import { isExpenseBackendConfigured } from "@config/apiConfig";
import ErrorNotice from "@components/error-notice/ErrorNotice";
import { FINANCE_EYEBROW } from "@constants/financeApps";
import FinanceShell from "../../components/FinanceShell";
import { ExpenseHistoryFilters } from "./ExpenseHistoryFilters";
import { ExpenseHistoryTable } from "./ExpenseHistoryTable";
import { ExpenseHistoryClaimDetails } from "./ExpenseHistoryClaimDetails";
import { ExpenseClaimActivityDrawer } from "./ExpenseClaimActivityDrawer";
import { useExpenseHistoryAppData, useExpenseHistoryClaims } from "./useExpenseHistory";
import { useExpenseEmployees } from "../useExpense";
import {
  EMPTY_HISTORY_FILTERS,
  makeNameResolver,
  toHistorySearchPayload,
  type HistoryClaim,
  type HistoryFilters,
} from "./expenseHistoryTypes";

export default function ExpenseClaimHistoryPage() {
  return (
    <FinanceShell
      eyebrow={FINANCE_EYEBROW.expense}
      title="Claim history"
      subtitle="Expense claims you have submitted, and where each one has got to."
      configured={isExpenseBackendConfigured()}
      configKey="ONE_WSO2_EXPENSE_CLAIMS_BACKEND_URL"
    >
      <HistoryBody />
    </FinanceShell>
  );
}

function HistoryBody() {
  const appData = useExpenseHistoryAppData();
  // Names are what the source shows on screen; addresses live in tooltips.
  const employees = useExpenseEmployees();
  const nameFor = useMemo(() => makeNameResolver(employees.data), [employees.data]);
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_HISTORY_FILTERS);
  // The claim being read in full — the details panel takes over the page, the
  // way the source slides it over the list.
  const [selected, setSelected] = useState<HistoryClaim | null>(null);
  // Independent of `selected`: the activity trail opens straight from a row's
  // status chip without going through the details first.
  const [activityClaim, setActivityClaim] = useState<HistoryClaim | null>(null);

  const email = appData.data?.userInfo.workEmail ?? undefined;
  const payload = useMemo(() => toHistorySearchPayload(filters, email), [filters, email]);
  const claims = useExpenseHistoryClaims(payload, Boolean(email));

  // FilterHolder.tsx:285 — nobody to have filed for means nothing to filter by.
  const canFilterBySubmission = (appData.data?.onBehalfOfEmployees ?? []).length > 0;

  if (selected) {
    return (
      <>
        <ExpenseHistoryClaimDetails
          claim={selected}
          appData={appData.data}
          onBack={() => setSelected(null)}
          onShowActivity={() => setActivityClaim(selected)}
        />
        <ExpenseClaimActivityDrawer claim={activityClaim} nameFor={nameFor} onClose={() => setActivityClaim(null)} />
      </>
    );
  }

  return (
    <Box>
      <ExpenseHistoryFilters
        filters={filters}
        onChange={setFilters}
        canFilterBySubmission={canFilterBySubmission}
      />

      {appData.isLoading || claims.isLoading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
          ))}
        </Stack>
      ) : appData.isError || claims.isError ? (
        <ErrorNotice
          error={appData.error ?? claims.error}
          onRetry={() => void claims.refetch()}
          retrying={claims.isFetching}
        >
          Couldn&apos;t load your claims.
        </ErrorNotice>
      ) : (claims.data?.length ?? 0) === 0 ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", py: 3 }}>
          No claims match these filters.
        </Typography>
      ) : (
        <ExpenseHistoryTable
          claims={claims.data!}
          onView={setSelected}
          onShowActivity={setActivityClaim}
        />
      )}

      <ExpenseClaimActivityDrawer claim={activityClaim} nameFor={nameFor} onClose={() => setActivityClaim(null)} />
    </Box>
  );
}
