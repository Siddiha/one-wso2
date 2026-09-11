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

import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from "@wso2/oxygen-ui";
import { ChevronRightIcon } from "@wso2/oxygen-ui-icons-react";
import { StatusChip, expenseStatusMeta } from "../../components/FinanceChips";
import { money } from "../../util/financeFormat";
import { historyDate } from "./expenseHistoryFormat";
import { isOnBehalfOfClaim, type HistoryClaim } from "./expenseHistoryTypes";

/** ClaimTable.tsx#getButtonLabel — a rejected claim can be corrected and resent. */
export function isRejected(claim: HistoryClaim): boolean {
  const s = claim.statusDetails.status;
  return s === "LEAD_REJECTED" || s === "FINANCE_REJECTED";
}

// This screen's own table rather than the `ClaimsTable` exported by the Me-side
// history page: that one is shared with the approvals screens, and this one
// carries an on-behalf marker and a status cell that opens the activity trail.
export function ExpenseHistoryTable({
  claims,
  onView,
  onShowActivity,
}: {
  claims: HistoryClaim[];
  onView: (claim: HistoryClaim) => void;
  onShowActivity: (claim: HistoryClaim) => void;
}) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
      <Table size="small">
        <TableHead>
          <TableRow
            sx={{
              "& th": {
                fontSize: 11,
                fontWeight: 700,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              },
            }}
          >
            <TableCell>Claim ID</TableCell>
            <TableCell>Submitted</TableCell>
            <TableCell align="right">Total Amount</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {claims.map((claim) => {
            const meta = expenseStatusMeta(claim.statusDetails.status);
            const rejected = isRejected(claim);
            return (
              <TableRow key={claim.id} hover>
                <TableCell sx={{ fontSize: 12.5, fontFamily: "monospace" }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <span>{claim.id}</span>
                    {/* utils.ts#isOnBehalfOfClaim — filed by someone else, so
                        the row is not about the signed-in person's own spend. */}
                    {isOnBehalfOfClaim(claim) && (
                      <Tooltip describeChild title={`Submitted by ${claim.submittedBy}`} arrow>
                        <Chip
                          label="On behalf"
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10, fontFamily: "inherit" }}
                        />
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
                <TableCell sx={{ fontSize: 12.5 }}>{historyDate(claim.createdDate)}</TableCell>
                <TableCell align="right" sx={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                  {money(claim.totalAmount, claim.currencyCode ?? "LKR")}
                </TableCell>
                <TableCell>
                  {/* ClaimTable.tsx:118 — the status is the way into the
                      activity trail, hence the chevron. Portal chip styling,
                      source behaviour. */}
                  <ButtonBase
                    onClick={() => onShowActivity(claim)}
                    aria-label={`Claim activity for ${claim.id}`}
                    sx={{ borderRadius: 5, display: "flex", alignItems: "center", gap: 0.25, p: 0.25 }}
                  >
                    <StatusChip label={meta.label} color={meta.color} />
                    <ChevronRightIcon size={13} />
                  </ButtonBase>
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    variant={rejected ? "contained" : "outlined"}
                    color={rejected ? "warning" : "primary"}
                    onClick={() => onView(claim)}
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    {rejected ? "View / Resubmit" : "View"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
