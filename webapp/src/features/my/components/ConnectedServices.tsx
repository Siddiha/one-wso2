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

import { useState } from "react";
import { Box, Button, Card, Skeleton, Stack, Tooltip, Typography } from "@wso2/oxygen-ui";
import { Link as RouterLink } from "react-router";
import { useUserInfo } from "@api/useUserInfo";
import { useAsgardeoUser } from "@hooks/useAsgardeoUser";
import VehiclesCard from "./VehiclesCard";
import { isPromotionBackendConfigured } from "../api/usePromotionEmployeeInfo";
import { usePromotionHistory } from "../api/usePromotionHistory";
import { latestPromotion, promotionSummary } from "../api/derive";
import PromotionHistoryDialog from "./PromotionHistoryDialog";
import PerformanceStages from "./PerformanceStages";
import BankAccountsCard from "./BankAccountsCard";

// Three cards surfacing adjacent people-ops-suite services inside the
// profile: Vehicles, Time off, Performance & growth. Vehicles is live
// against people-app's GET/POST/DELETE /employees/{email}/vehicles;
// Time off + Performance are still sample data until those backends land.
export default function ConnectedServices() {
  const userInfo = useUserInfo();
  const asgardeoUser = useAsgardeoUser();
  // Vehicle + promotion endpoints key on the caller's email. Prefer
  // /user-info's workEmail (canonical), fall back to the id_token email
  // claim.
  const ownerEmail = userInfo.data?.workEmail ?? asgardeoUser.email;
  // Sourced from the approved promotion requests, not /employee-info's
  // lastPromotedDate column — that column goes stale (the promotion
  // backend's own eligibility check overrides it for the same reason),
  // which showed "Never promoted" for people with approved promotions.
  // enabled: true because this line renders on load; the dialog's lazy
  // query shares the cache key, so opening it costs no extra request.
  const promotionInfo = usePromotionHistory(ownerEmail, true);
  const lastPromotion = latestPromotion(promotionInfo.data?.promotionRequests);
  const promotionConfigured = isPromotionBackendConfigured();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.75 }}>
        {/* Performance */}
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography sx={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary", fontWeight: 600, mb: 1.5 }}>
            Performance &amp; growth
          </Typography>
          <Stack direction="row" spacing={1.25} sx={{ py: 1.125, alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 500, fontSize: 13 }}>Last promotion</Typography>
              <LastPromotionValue
                configured={promotionConfigured}
                // isPaused covers a retry held back while the tab is in the
                // background — still loading, not an empty result.
                isLoading={promotionInfo.isLoading || promotionInfo.isPaused}
                isError={promotionInfo.isError}
                summary={lastPromotion ? promotionSummary(lastPromotion) : null}
              />
            </Box>
            {/* History is only offered when there is something to show —
                with no approved promotions (or while loading, or when the
                backend isn't configured) the dialog would be empty. A failed
                load gets a retry instead, since nothing else re-fetches. */}
            {lastPromotion ? (
              <Button variant="outlined" size="small" onClick={() => setHistoryOpen(true)}>
                View promotion history
              </Button>
            ) : promotionInfo.isError ? (
              <Button
                size="small"
                disabled={promotionInfo.isFetching}
                onClick={() => void promotionInfo.refetch()}
              >
                Retry
              </Button>
            ) : null}
          </Stack>
          <PerformanceStages workEmail={ownerEmail} />
          <Box sx={{ mt: 1.25 }}>
            <Button variant="outlined" size="small" component={RouterLink} to="/me/performance" fullWidth>
              Open employee feedback
            </Button>
          </Box>
        </Card>

        <BankAccountsCard ownerEmail={ownerEmail} />

        <VehiclesCard ownerEmail={ownerEmail} />
      </Box>

      <PromotionHistoryDialog
        open={historyOpen}
        workEmail={ownerEmail}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}

// Sub-line under the "Last promotion" label. Renders one of:
//   - not configured hint (promotion backend URL absent)
//   - skeleton (loading)
//   - error dash (fetch failed; hover for reason)
//   - "No promotions" (nothing approved on record — new joiner, or every
//     request still in flight; states what the data shows rather than
//     asserting the person has never been promoted)
//   - cycle + band jump (happy path)
function LastPromotionValue({
  configured,
  isLoading,
  isError,
  summary,
}: {
  configured: boolean;
  isLoading: boolean;
  isError: boolean;
  summary: string | null;
}) {
  const base = { fontSize: 12, color: "text.secondary" as const };
  if (!configured) {
    return (
      <Tooltip title="Set ONE_WSO2_PROMOTION_BACKEND_URL to enable this." placement="top">
        <Typography sx={{ ...base, color: "text.disabled", fontStyle: "italic" }}>
          Not configured
        </Typography>
      </Tooltip>
    );
  }
  if (isLoading) {
    return <Skeleton variant="text" width={90} sx={{ fontSize: 12 }} />;
  }
  if (isError) {
    return (
      <Tooltip title="Couldn't reach the promotion backend." placement="top">
        <Typography sx={{ ...base, color: "error.main" }}>Couldn't load</Typography>
      </Tooltip>
    );
  }
  if (!summary) {
    return (
      <Typography sx={{ ...base, color: "text.disabled" }}>No promotions</Typography>
    );
  }
  return (
    <Typography sx={{ ...base, fontVariantNumeric: "tabular-nums" }}>{summary}</Typography>
  );
}

