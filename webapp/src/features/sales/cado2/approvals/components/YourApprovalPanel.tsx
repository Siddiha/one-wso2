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

import { useState, type JSX, type ReactNode } from "react";
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from "@wso2/oxygen-ui";
import {
  BadgePercentIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  EyeIcon,
  FileTextIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  TagIcon,
  TrendingDownIcon,
} from "@wso2/oxygen-ui-icons-react";
import type { ApprovalOutcome, ApprovalStep } from "@features/sales/cado2/approvals/api/approvalTypes";
import { deskSummary, reasonRows, type ReasonKind, type ReasonRow } from "@features/sales/cado2/approvals/model/myApprovals";

interface YourApprovalPanelProps {
  /** The whole workflow's steps. */
  readonly steps: readonly ApprovalStep[];
  /** The steps the viewer may decide now; usually one. */
  readonly actionable: readonly ApprovalStep[];
  /** After a decision: what was recorded, e.g. "Approved as CRO." */
  readonly note: string | null;
  /**
   * Deal Desk: what they verify themselves: the lines whose category the rep
   * chose (repCategoryPoints) and a renewal starting another day (renewalStartPoints).
   */
  readonly repCategories?: readonly ReasonRow[];
  /** Opens the confirmation for a decision on one of the viewer's steps. */
  readonly onDecide: (outcome: ApprovalOutcome, step: ApprovalStep) => void;
}

/** Where the header's "Your approval" link scrolls to. */
export const YOUR_APPROVAL_ANCHOR = "cado2-your-approval";

const ICON: Record<ReasonKind, ReactNode> = {
  discount: <BadgePercentIcon size={16} />,
  review: <EyeIcon size={16} />,
  terms: <FileTextIcon size={16} />,
  term: <CalendarClockIcon size={16} />,
  downsell: <TrendingDownIcon size={16} />,
  payment: <ReceiptIcon size={16} />,
  category: <TagIcon size={16} />,
  other: <ShieldCheckIcon size={16} />,
};

const joinRoles = (roles: readonly string[]) =>
  roles.length === 1 ? roles[0] : `${roles.slice(0, -1).join(", ")} and ${roles.at(-1)}`;

/** One reason: an icon for its kind, what it's about, and the figure that triggered it. */
function Reason({ row }: { readonly row: ReasonRow }): JSX.Element {
  return (
    <Stack component="li" direction="row" spacing={1.5} alignItems="flex-start" sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "action.hover" }}>
      <Box
        aria-hidden
        sx={{ flexShrink: 0, width: 32, height: 32, borderRadius: 1.5, display: "grid", placeItems: "center",
          bgcolor: "background.paper", color: "primary.main", border: 1, borderColor: "divider" }}
      >
        {ICON[row.kind]}
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {row.title}
          </Typography>
          {row.group ? <Chip size="small" variant="outlined" label={row.group} /> : null}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25, flexWrap: "wrap", rowGap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {/* The figure in bold, in the card's own colours. */}
            {row.figure ? (
              <Box component="strong" sx={{ color: "text.primary", fontWeight: 600 }}>
                {`${row.figure} discount`}
                {" · "}
              </Box>
            ) : null}
            {row.detail}
            {row.roles?.length ? ` · needs ${joinRoles(row.roles)}` : null}
          </Typography>
        </Stack>
      </Box>
    </Stack>
  );
}

const ReasonList = ({ rows, label }: { readonly rows: readonly ReasonRow[]; readonly label: string }) => (
  <Stack component="ul" spacing={1} aria-label={label} sx={{ m: 0, p: 0, listStyle: "none" }}>
    {rows.map((r) => (
      <Reason key={`${r.title}|${r.detail}`} row={r} />
    ))}
  </Stack>
);

/** Reasons shown before "Show N more", so the panel never pushes the quote out of view. */
const FIRST_REASONS = 3;

const Toggle = ({ open, onClick, children }: { readonly open: boolean; readonly onClick: () => void; readonly children: ReactNode }) => (
  <Button
    size="small"
    onClick={onClick}
    aria-expanded={open}
    endIcon={open ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
    sx={{ mt: 1, px: 0.5 }}
  >
    {children}
  </Button>
);

/** The first few reasons, the rest on request, so the panel never pushes the quote out of view. */
function ShortList({ rows, label }: { readonly rows: readonly ReasonRow[]; readonly label: string }): JSX.Element {
  const [all, setAll] = useState(false);
  const hidden = rows.length - FIRST_REASONS;
  return (
    <Box sx={{ mt: 1 }}>
      <ReasonList rows={all ? rows : rows.slice(0, FIRST_REASONS)} label={label} />
      {hidden > 0 ? (
        <Toggle open={all} onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show ${hidden} more`}
        </Toggle>
      ) : null}
    </Box>
  );
}

/** Deal Desk: everything non-standard about the quote, once each, with the approvals it needs. */
function DeskReview({
  steps,
  step,
  repCategories,
}: {
  readonly steps: readonly ApprovalStep[];
  readonly step: ApprovalStep;
  readonly repCategories: readonly ReasonRow[];
}): JSX.Element {
  // What Deal Desk verifies themselves first, then what later approvers will check.
  const points = [...repCategories, ...deskSummary(steps, step)];
  if (!points.length) {
    // No points to show doesn't mean nobody approves after Deal Desk.
    const more = steps.some((s) => s.role !== step.role && (s.status === "WAITING" || s.status === "PENDING"));
    return more ? (
      <Typography variant="body2" color="text.secondary">
        Further approvals follow, with no specific points recorded. See the Approvals tab.
      </Typography>
    ) : (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "success.main" }}>
        <CircleCheckIcon size={16} />
        <Typography variant="body2">Nothing non-standard: no further approvals are needed.</Typography>
      </Stack>
    );
  }
  return <ShortList rows={points} label="What's non-standard" />;
}

/** Any other approver: why their role is asked. */
function OwnReasons({ step }: { readonly step: ApprovalStep }): JSX.Element {
  const rows = reasonRows(step);
  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No specific reason was recorded.
      </Typography>
    );
  }
  return <ShortList rows={rows} label={`Why ${step.roleLabel} approves`} />;
}

/**
 * When it's the viewer's turn: which role they act as and why it's asked.
 * Deal Desk reviews every quote, so they see what's non-standard about it.
 * Kept short, so the quote stays in view. Nothing when there is neither a
 * turn nor a note.
 */
export default function YourApprovalPanel({
  steps,
  actionable,
  note,
  repCategories = [],
  onDecide,
}: YourApprovalPanelProps): JSX.Element | null {
  if (!note && actionable.length === 0) return null;
  return (
    <Stack spacing={1.5} id={YOUR_APPROVAL_ANCHOR} sx={{ scrollMarginTop: 16 }}>
      {note ? (
        <Alert severity="success" role="status">
          {note}
        </Alert>
      ) : null}
      {/* Several roles sit side by side, so they cost one card's height, not several. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0,1fr)", md: actionable.length > 1 ? "repeat(2, minmax(0,1fr))" : "minmax(0,1fr)" },
          gap: 2,
          alignItems: "stretch",
        }}
      >
        {actionable.map((s) => {
          const deskReview = s.role === "DEAL_DESK";
          return (
            <Paper
              key={s.role}
              component="section"
              variant="outlined"
              aria-label={`Your approval as ${s.roleLabel}`}
              sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderLeftColor: "primary.main", display: "flex", flexDirection: "column" }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                <ShieldCheckIcon size={18} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {deskReview ? "What's non-standard" : "Why your approval is needed"}
                </Typography>
                <Chip size="small" color="primary" label={s.roleLabel} />
              </Stack>
              {deskReview ? <DeskReview steps={steps} step={s} repCategories={repCategories} /> : <OwnReasons step={s} />}
              {/* The decision sits with its reasons; the card already names the role. */}
              {/* Under the reasons, Approve first: where the eye ends after reading. Pushed
                  to the card's foot, so side-by-side cards line their buttons up. */}
              <Stack direction="row" spacing={1} justifyContent="flex-start" sx={{ mt: "auto", pt: 2, flexWrap: "wrap", rowGap: 1 }}>
                <Button variant="contained" color="success" onClick={() => onDecide("approve", s)}>
                  Approve
                </Button>
                <Button variant="outlined" onClick={() => onDecide("request-changes", s)}>
                  Request changes
                </Button>
                <Button variant="outlined" color="error" onClick={() => onDecide("reject", s)}>
                  Reject
                </Button>
              </Stack>
            </Paper>
          );
        })}
      </Box>
    </Stack>
  );
}
