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

import { Box, Chip, Skeleton, Stack, Tooltip, Typography } from "@wso2/oxygen-ui";
import type {
  ParCycleStatus,
  ParEmployeeStatus,
  ParF2fStatus,
  ParLeadStatus,
} from "@features/par/api/types";
import {
  isParBackendConfigured,
  useLatestReviewCycle,
  useParRating,
} from "@features/par/api/useParData";
import { formatDate } from "../api/derive";

// Compact horizontal 4-stage breadcrumb for the Performance & growth
// card, rendered below the "Last promotion" row. Stages are the ones
// the employee moves through in a cycle:
//
//   1. Employee PAR submission  — parEmployeeStatus
//   2. 360° PAR submission      — derived (backend has no single field)
//   3. Lead PAR submission      — parLeadStatus
//   4. Conduct F2F meeting      — parF2fStatus
//
// The stepper reads left-to-right, so the visual position of the ring
// tells the reader "you are here". A single detail line below the
// stepper spells out the current stage's status and deadline in words.
//
// Cycle source: OPEN cycle first; if none, the most recent CLOSED cycle
// so the section stays informative between cycles.
export default function PerformanceStages({ workEmail }: { workEmail?: string }) {
  const configured = isParBackendConfigured();
  const review = useLatestReviewCycle(workEmail);
  const rating = useParRating(review.cycle?.parCycleId, workEmail);

  if (!configured) {
    return (
      <Tooltip title="Set ONE_WSO2_PAR_BACKEND_URL to enable this." placement="top">
        <Typography sx={{ py: 1.5, fontSize: 12.5, color: "text.disabled", fontStyle: "italic", cursor: "help" }}>
          PAR backend not configured.
        </Typography>
      </Tooltip>
    );
  }

  if (review.isLoading) {
    return (
      <Box sx={{ py: 1.125 }}>
        <Skeleton variant="text" width={180} sx={{ mb: 0.75, fontSize: 13 }} />
        <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1, mb: 0.75 }} />
        <Skeleton variant="text" width={220} sx={{ fontSize: 11 }} />
      </Box>
    );
  }

  if (review.isError) {
    return (
      <Typography sx={{ py: 1.5, fontSize: 12.5, color: "error.main" }}>
        Couldn't load your review cycle.
      </Typography>
    );
  }

  if (!review.cycle) {
    return (
      <Typography sx={{ py: 1.5, fontSize: 12.5, color: "text.secondary" }}>
        No active or past PAR cycle on file.
      </Typography>
    );
  }

  const cycle = review.cycle;
  const cycleStatus = cycle.parCycleStatus;

  // For an active cycle the per-stage status comes from the rating record.
  // Wait for it (and surface a genuine failure) before deriving stages —
  // otherwise a still-loading or failed rating maps submitted stages to
  // "Pending" and shows wrong progress. `rating.data === null` is the valid
  // no-rating case (the hook maps a 404 to null), so only block on
  // isLoading / isError.
  if (review.isActive && rating.isLoading) {
    return (
      <Box sx={{ py: 1.125 }}>
        <Skeleton variant="text" width={180} sx={{ mb: 0.75, fontSize: 13 }} />
        <Skeleton variant="rectangular" height={44} sx={{ borderRadius: 1, mb: 0.75 }} />
        <Skeleton variant="text" width={220} sx={{ fontSize: 11 }} />
      </Box>
    );
  }
  if (review.isActive && rating.isError) {
    return (
      <Typography sx={{ py: 1.5, fontSize: 12.5, color: "error.main" }}>
        Couldn't load your PAR rating.
      </Typography>
    );
  }

  const par = rating.data;

  const stages: Stage[] = [
    {
      index: 1,
      shortLabel: "Emp",
      fullLabel: "Employee PAR",
      status: mapEmployeeStatus(par?.parEmployeeStatus, cycleStatus),
      deadline: cycle.parEmployeeDeadline,
    },
    {
      index: 2,
      shortLabel: "360°",
      fullLabel: "360° PAR",
      status: map360Status(cycleStatus, review.isActive),
      deadline: cycle.parThreeSixtyRatingDeadline,
    },
    {
      index: 3,
      shortLabel: "Lead",
      fullLabel: "Lead PAR",
      status: mapLeadStatus(par?.parLeadStatus, cycleStatus),
      deadline: cycle.parLeadDeadline,
    },
    {
      index: 4,
      shortLabel: "F2F",
      fullLabel: "F2F meeting",
      status: mapF2fStatus(par?.parF2fStatus, cycleStatus),
      deadline: cycle.parF2FDeadline,
    },
  ];

  // The stages are broadly sequential, and 360° has no direct per-employee
  // status field, so a later completed stage implies the earlier ones are
  // done too. Fold "done" leftward: the stepper can then never show a
  // completed stage sitting after an incomplete one (which is what made a
  // locked Employee PAR look like it was blocking finished Lead/F2F steps).
  const doneMono: boolean[] = new Array(stages.length).fill(false);
  for (let i = stages.length - 1; i >= 0; i--) {
    doneMono[i] = stages[i].status.done || (i + 1 < stages.length && doneMono[i + 1]);
  }
  // Current = leftmost stage that isn't (effectively) done; if all are done,
  // park on the last so the detail line still has something to point at.
  // Skip the derived 360° stage (index 1): it has no per-employee status and
  // is always "in progress" during an active cycle, so without this the
  // pointer would stick on 360° and the Lead stage could never surface as
  // current (its deadline would never show).
  const DERIVED_360_IDX = 1;
  let currentIdx = doneMono.findIndex((d, i) => !d && i !== DERIVED_360_IDX);
  if (currentIdx === -1) currentIdx = stages.length - 1;
  const detail = stages[currentIdx];

  return (
    <Box sx={{ pt: 1.125 }}>
      {/* Cycle header — name + status chip */}
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.25 }}>
        <Typography sx={{ fontWeight: 500, fontSize: 13, flex: 1, minWidth: 0 }} noWrap>
          {cycle.parCycleName} review
        </Typography>
        <Chip
          label={review.isActive ? "Active" : "Past"}
          size="small"
          color={review.isActive ? "primary" : "default"}
          variant="outlined"
          sx={{ height: 18, fontSize: 10.25, fontWeight: 600, letterSpacing: "0.03em" }}
        />
      </Stack>

      {/* Horizontal 4-node stepper — connectors between nodes carry the
          "progress" story; the ring on the current node marks "you are
          here". Labels sit directly below each node. */}
      <Stack direction="row" alignItems="flex-start" sx={{ px: 0.25 }}>
        {stages.map((s, i) => {
          const state: NodeState =
            doneMono[i] ? "done" : i === currentIdx ? "current" : "upcoming";
          return (
            <Box
              key={s.index}
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                minWidth: 0,
              }}
            >
              {/* Left connector */}
              {i > 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 10,
                    left: 0,
                    right: "50%",
                    height: 2,
                    backgroundColor: doneMono[i - 1] ? "primary.main" : "divider",
                  }}
                />
              )}
              {/* Right connector */}
              {i < stages.length - 1 && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 10,
                    left: "50%",
                    right: 0,
                    height: 2,
                    backgroundColor: doneMono[i] ? "primary.main" : "divider",
                  }}
                />
              )}
              <StageNode index={s.index} state={state} />
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: state === "upcoming" ? "text.disabled" : "text.secondary",
                  mt: 0.5,
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {s.shortLabel}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      {/* Single-line spec of the current stage — spells out what the
          circles mean so a first-time reader doesn't have to hover. */}
      <Typography
        sx={{
          fontSize: 11.5,
          color: "text.secondary",
          mt: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {review.isActive ? (
          <>
            <b>Stage {detail.index}:</b> {detail.fullLabel} · {detail.status.label}
            {detail.deadline ? <> · due {formatDate(detail.deadline)}</> : null}
          </>
        ) : (
          <>Cycle closed · all four stages complete.</>
        )}
      </Typography>
    </Box>
  );
}

// ---- types + node --------------------------------------------------------

interface StageStatus {
  label: string;
  done: boolean;
}

interface Stage {
  index: number;
  shortLabel: string;
  fullLabel: string;
  status: StageStatus;
  deadline: string | undefined | null;
}

type NodeState = "done" | "current" | "upcoming";

// A single circular node in the stepper. Filled orange = done, outlined
// with orange ring = current, outlined muted = upcoming.
function StageNode({ index, state }: { index: number; state: NodeState }) {
  return (
    <Box
      sx={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10.5,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        position: "relative",
        zIndex: 1,
        transition: "none",
        ...(state === "done"
          ? {
              backgroundColor: "primary.main",
              color: "primary.contrastText",
              border: "2px solid",
              borderColor: "primary.main",
            }
          : state === "current"
          ? {
              backgroundColor: "background.paper",
              color: "primary.main",
              border: "2px solid",
              borderColor: "primary.main",
              boxShadow: (theme) =>
                `0 0 0 3px ${theme.palette.mode === "dark" ? "rgba(241,78,35,0.18)" : "rgba(241,78,35,0.12)"}`,
            }
          : {
              backgroundColor: "background.paper",
              color: "text.disabled",
              border: "2px solid",
              borderColor: "divider",
            }),
      }}
    >
      {state === "done" ? <CheckIcon /> : index}
    </Box>
  );
}

function CheckIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ---- status mappers --------------------------------------------------------
// A CLOSED cycle collapses every stage to "Complete" — by the time a
// cycle closes all stages have been sealed off, and we don't want to
// re-render a past record with a stale in-flight state.

function mapEmployeeStatus(
  status: ParEmployeeStatus | undefined,
  cycleStatus: ParCycleStatus,
): StageStatus {
  if (cycleStatus === "CLOSED") return { label: "Complete", done: true };
  switch (status) {
    case "SHARED":
      return { label: "Submitted", done: true };
    case "DRAFT":
      return { label: "Draft", done: false };
    case "SHARED_BLOCKED":
      // Employee already SHARED (submitted); the backend locks it once the
      // lead moves off PENDING. So this stage is DONE — just no longer
      // editable — not an incomplete "blocked" step.
      return { label: "Submitted · locked", done: true };
    case "PENDING":
    default:
      return { label: "Pending", done: false };
  }
}

function mapLeadStatus(
  status: ParLeadStatus | undefined,
  cycleStatus: ParCycleStatus,
): StageStatus {
  if (cycleStatus === "CLOSED") return { label: "Complete", done: true };
  switch (status) {
    case "SHARED":
      return { label: "Submitted", done: true };
    case "DRAFT":
      return { label: "Draft", done: false };
    case "PENDING":
    default:
      return { label: "Pending", done: false };
  }
}

function mapF2fStatus(
  status: ParF2fStatus | undefined,
  cycleStatus: ParCycleStatus,
): StageStatus {
  if (cycleStatus === "CLOSED") return { label: "Complete", done: true };
  switch (status) {
    case "COMPLETED":
      return { label: "Complete", done: true };
    case "SCHEDULED":
      return { label: "Scheduled", done: false };
    case "PENDING":
    default:
      return { label: "Pending", done: false };
  }
}

// 360 has no single per-employee status field on ParRating — it's an
// aggregate across the caller's reviewers. Until we wire an aggregate
// call (against /reviewers + /reviews) the status is derived from the
// cycle: past cycles are Complete, active ones read as In progress.
function map360Status(cycleStatus: ParCycleStatus, isActive: boolean): StageStatus {
  if (cycleStatus === "CLOSED" || !isActive) {
    return { label: "Complete", done: true };
  }
  return { label: "In progress", done: false };
}
