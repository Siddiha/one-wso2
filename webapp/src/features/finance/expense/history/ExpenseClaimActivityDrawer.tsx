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

import { Box, Drawer, IconButton, Stack, Typography } from "@wso2/oxygen-ui";
import { XIcon } from "@wso2/oxygen-ui-icons-react";
import { StatusChip, expenseStatusMeta } from "../../components/FinanceChips";
import { ExpenseClaimTimeline } from "./ExpenseClaimTimeline";
import type { HistoryClaim } from "./expenseHistoryTypes";

/**
 * The claim's three-stage approval trail, opened from the status chip in the
 * list. A right-hand drawer rather than this app's usual Dialog: the trail is
 * context to glance at beside the list, not a task to complete, and the source
 * app puts it in the same place.
 */
export function ExpenseClaimActivityDrawer({
  claim,
  onClose,
}: {
  claim: HistoryClaim | null;
  onClose: () => void;
}) {
  const meta = expenseStatusMeta(claim?.statusDetails.status);
  return (
    <Drawer
      anchor="right"
      open={Boolean(claim)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 350, maxWidth: "100vw" } } }}
    >
      {claim && (
        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Claim Activity</Typography>
            <IconButton size="small" onClick={onClose} aria-label="Close claim activity">
              <XIcon size={17} />
            </IconButton>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
            <Typography sx={{ fontSize: 12.5, fontFamily: "monospace", color: "text.secondary" }}>
              {claim.id}
            </Typography>
            <StatusChip label={meta.label} color={meta.color} />
          </Stack>

          <ExpenseClaimTimeline claim={claim} />
        </Box>
      )}
    </Drawer>
  );
}
