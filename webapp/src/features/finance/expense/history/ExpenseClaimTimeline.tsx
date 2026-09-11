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

import { Box, Stack, Typography } from "@wso2/oxygen-ui";
import { ReceiptTextIcon, UserRoundIcon, UsersIcon, type LucideIcon } from "@wso2/oxygen-ui-icons-react";
import { historyDateTime } from "./expenseHistoryFormat";
import { isOnBehalfOfClaim, type HistoryClaim } from "./expenseHistoryTypes";

// CustomTimelineItem.tsx — the same three stages and status→colour mapping,
// laid out by hand (dot + connector) because @mui/lab is not a dependency here
// and nothing else in this app needs a Timeline.
type StageTone = "success" | "warning" | "error" | "idle";

const TONE_COLOR: Record<StageTone, string> = {
  success: "success.main",
  warning: "warning.main",
  error: "error.main",
  idle: "grey.400",
};

interface Stage {
  label: string;
  Icon: LucideIcon;
  date: string | null;
  /** The parenthetical after the label — absent once a stage is simply done. */
  statusLabel?: "Pending" | "Approved" | "Rejected";
  tone: StageTone;
  reason?: string | null;
  note?: string | null;
}

/**
 * Stages are derived during render, not in a mount-only effect the way the
 * source does it (CustomTimelineItem.tsx:39). The drawer keeps one component
 * instance alive across claims, so colours computed once on mount would
 * describe whichever claim happened to be open first.
 */
export function claimStages(claim: HistoryClaim): Stage[] {
  const s = claim.statusDetails;
  const status = s.status;

  const submission: Stage = {
    label: "Claim Submission",
    Icon: ReceiptTextIcon,
    date: claim.createdDate,
    tone: "success",
    note: isOnBehalfOfClaim(claim) ? `Submitted by ${claim.submittedBy}` : null,
  };

  const lead: Stage =
    status === "PENDING_LEAD"
      ? { label: "Lead Review", Icon: UserRoundIcon, date: null, tone: "warning", statusLabel: "Pending" }
      : status === "LEAD_REJECTED"
        ? {
            label: "Lead Review",
            Icon: UserRoundIcon,
            date: s.leadRejectedDate,
            tone: "error",
            statusLabel: "Rejected",
            reason: s.leadRejectedReason,
          }
        : status === "PENDING_FINANCE" || status === "APPROVED" || status === "FINANCE_REJECTED"
          ? { label: "Lead Review", Icon: UserRoundIcon, date: s.leadApprovedDate, tone: "success" }
          : { label: "Lead Review", Icon: UserRoundIcon, date: null, tone: "idle" };

  const finance: Stage =
    status === "PENDING_FINANCE"
      ? { label: "Finance Review", Icon: UsersIcon, date: null, tone: "warning", statusLabel: "Pending" }
      : status === "FINANCE_REJECTED"
        ? { label: "Finance Review", Icon: UsersIcon, date: s.financeRejectedDate, tone: "error", statusLabel: "Rejected" }
        : status === "APPROVED"
          ? { label: "Finance Review", Icon: UsersIcon, date: s.financeApprovedDate, tone: "success", statusLabel: "Approved" }
          // Hasn't reached finance yet — still with the lead, or lead-rejected.
          : { label: "Finance Review", Icon: UsersIcon, date: null, tone: "idle" };

  return [submission, lead, finance];
}

export function ExpenseClaimTimeline({ claim }: { claim: HistoryClaim }) {
  const stages = claimStages(claim);
  return (
    <Stack spacing={0}>
      {stages.map((stage, i) => (
        <Box key={stage.label} sx={{ display: "flex", gap: 1.5 }}>
          <Stack alignItems="center">
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1.5px solid",
                borderColor: TONE_COLOR[stage.tone],
                color: TONE_COLOR[stage.tone],
                flexShrink: 0,
              }}
            >
              <stage.Icon size={15} />
            </Box>
            {i < stages.length - 1 && (
              <Box sx={{ width: 2, flex: 1, minHeight: 40, bgcolor: "divider", my: 0.5 }} />
            )}
          </Stack>

          <Box sx={{ pb: 3, pt: 0.4, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: TONE_COLOR[stage.tone] }}>
              {stage.label}
              {stage.statusLabel && (
                <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 500, ml: 0.5 }}>
                  ({stage.statusLabel})
                </Typography>
              )}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {stage.date ? historyDateTime(stage.date) : "—"}
            </Typography>
            {stage.note && (
              <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: 0.25 }}>{stage.note}</Typography>
            )}
            {/* The lead's rejection reason is shown here and nowhere else —
                the claim list has no room for it and the backend carries no
                equivalent for a finance rejection. */}
            {stage.reason && (
              <Typography sx={{ fontSize: 12, mt: 0.5, wordBreak: "break-word" }}>
                <Typography component="span" sx={{ fontWeight: 600 }}>
                  Reason:
                </Typography>{" "}
                {stage.reason}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
