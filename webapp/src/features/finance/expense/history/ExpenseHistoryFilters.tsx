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

import { useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { CalendarIcon, FilterIcon } from "@wso2/oxygen-ui-icons-react";
import { EXPENSE_FILTERABLE_STATUSES, type ExpenseClaimStatus } from "../expenseTypes";
import { expenseStatusMeta } from "../../components/FinanceChips";
import { todayIso } from "../../util/financeFormat";
import {
  CLAIM_RANGE_CUSTOM,
  CLAIM_RANGE_LATEST,
  CLAIM_SUBMISSION_SCOPES,
  submissionScopeLabel,
  type ClaimSubmissionScope,
  type HistoryFilters,
} from "./expenseHistoryTypes";

/**
 * FilterHolder.tsx — the range and status selects apply the moment they change;
 * the date range and the "Filters" popover hold their edits behind an Apply.
 * Nothing here is debounced: Apply is the source's gate, and this list search
 * spans every claim the caller can see.
 */
export function ExpenseHistoryFilters({
  filters,
  onChange,
  canFilterBySubmission,
}: {
  filters: HistoryFilters;
  onChange: (next: HistoryFilters) => void;
  /** Only offered when there is somebody this person could have filed for. */
  canFilterBySubmission: boolean;
}) {
  const rangeFieldRef = useRef<HTMLDivElement | null>(null);
  const moreFieldRef = useRef<HTMLDivElement | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);

  // Both popovers edit a copy and commit on Apply, so a cancelled edit leaves
  // the live filters (and the query they drive) untouched.
  const [draftStart, setDraftStart] = useState(filters.startDate);
  const [draftEnd, setDraftEnd] = useState(filters.endDate);
  const [draftClaimId, setDraftClaimId] = useState(filters.claimId);
  const [draftScope, setDraftScope] = useState<ClaimSubmissionScope>(filters.submissionScope);

  const openRange = (anchor: HTMLElement) => {
    setDraftStart(filters.startDate);
    setDraftEnd(filters.endDate);
    setRangeAnchor(anchor);
  };

  const openMore = (anchor: HTMLElement) => {
    setDraftClaimId(filters.claimId);
    setDraftScope(filters.submissionScope);
    setMoreAnchor(anchor);
  };

  const rangeReady = Boolean(draftStart) && Boolean(draftEnd) && draftStart <= draftEnd;
  const hasCustomRange = Boolean(filters.startDate) && Boolean(filters.endDate);
  const extraCount = (filters.claimId ? 1 : 0) + (filters.submissionScope !== "ALL_CLAIMS" ? 1 : 0);

  return (
    <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: "wrap", alignItems: "center" }}>
      <FormControl size="small" ref={rangeFieldRef}>
        <InputLabel id="expense-history-range">Claim Range</InputLabel>
        <Select
          labelId="expense-history-range"
          label="Claim Range"
          value={filters.range}
          sx={{ minWidth: 150 }}
          onChange={(e) => {
            if (String(e.target.value) === CLAIM_RANGE_CUSTOM) {
              // Picking "Custom Date" only opens the calendar — the range is
              // not applied until there are two dates to apply.
              if (rangeFieldRef.current) openRange(rangeFieldRef.current);
              return;
            }
            // Back to Latest 100 clears the dates, as the source does.
            onChange({ ...filters, range: CLAIM_RANGE_LATEST, startDate: "", endDate: "" });
          }}
        >
          <MenuItem value={CLAIM_RANGE_LATEST}>{CLAIM_RANGE_LATEST}</MenuItem>
          <MenuItem value={CLAIM_RANGE_CUSTOM}>{CLAIM_RANGE_CUSTOM}</MenuItem>
        </Select>
      </FormControl>

      {hasCustomRange && (
        <Chip
          size="small"
          variant="outlined"
          icon={<CalendarIcon size={13} />}
          label={`${filters.startDate} ~ ${filters.endDate}`}
          onClick={(e) => openRange(e.currentTarget)}
          sx={{ fontSize: 11.5 }}
        />
      )}

      <FormControl size="small">
        <InputLabel id="expense-history-status">Status</InputLabel>
        <Select
          labelId="expense-history-status"
          label="Status"
          value={filters.status}
          sx={{ minWidth: 150 }}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value as ExpenseClaimStatus | "All" })
          }
        >
          <MenuItem value="All">All</MenuItem>
          {EXPENSE_FILTERABLE_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {expenseStatusMeta(s).label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* The same outlined field as the two Selects beside it, rather than a
          Button dressed to match: a real Select brings the notched label, the
          white ground, the height and the chevron for free, so it cannot
          drift from them. Its own menu never opens — `open={false}` with an
          `onOpen` that raises the popover below instead. */}
      <FormControl size="small" ref={moreFieldRef}>
        <Select
          value=""
          displayEmpty
          open={false}
          onOpen={() => {
            if (moreFieldRef.current) openMore(moreFieldRef.current);
          }}
          // No floating label: the funnel and the word sit INSIDE the field,
          // the way the source app draws this control, while the field itself
          // stays the same outlined box as the two Selects beside it.
          renderValue={() => (
            <Stack direction="row" alignItems="center" spacing={1}>
              <FilterIcon size={15} />
              <span>Filters{extraCount > 0 ? ` (${extraCount})` : ""}</span>
            </Stack>
          )}
          inputProps={{ "aria-label": "Filters" }}
          sx={{ minWidth: 150 }}
        />
      </FormControl>

      <Popover
        open={Boolean(rangeAnchor)}
        anchorEl={rangeAnchor}
        onClose={() => setRangeAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 1.5 }}>Custom date range</Typography>
          <Stack spacing={1.5}>
            <TextField
              size="small"
              type="date"
              label="From"
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIso() } }}
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: draftStart || undefined, max: todayIso() },
              }}
              value={draftEnd}
              onChange={(e) => setDraftEnd(e.target.value)}
            />
          </Stack>
          <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
            <Button size="small" onClick={() => setRangeAnchor(null)}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={!rangeReady}
              onClick={() => {
                onChange({
                  ...filters,
                  range: CLAIM_RANGE_CUSTOM,
                  startDate: draftStart,
                  endDate: draftEnd,
                });
                setRangeAnchor(null);
              }}
            >
              Apply
            </Button>
          </Stack>
        </Box>
      </Popover>

      <Popover
        open={Boolean(moreAnchor)}
        anchorEl={moreAnchor}
        onClose={() => setMoreAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 2, width: 280 }}>
          <Stack spacing={1.75}>
            <TextField
              size="small"
              label="Filter by claim ID"
              value={draftClaimId}
              onChange={(e) => setDraftClaimId(e.target.value)}
            />
            {/* FilterHolder.tsx:285 — only shown to someone who can file for
                others; for everyone else every claim is their own. */}
            {canFilterBySubmission && (
              <FormControl size="small" fullWidth>
                <InputLabel id="expense-history-scope">Filter by submission</InputLabel>
                <Select
                  labelId="expense-history-scope"
                  label="Filter by submission"
                  value={draftScope}
                  onChange={(e) => setDraftScope(e.target.value as ClaimSubmissionScope)}
                >
                  {CLAIM_SUBMISSION_SCOPES.map((scope) => (
                    <MenuItem key={scope} value={scope}>
                      {submissionScopeLabel(scope)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
          <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 2 }}>
            <Button size="small" onClick={() => setMoreAnchor(null)}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                onChange({ ...filters, claimId: draftClaimId.trim(), submissionScope: draftScope });
                setMoreAnchor(null);
              }}
            >
              Apply
            </Button>
          </Stack>
        </Box>
      </Popover>
    </Stack>
  );
}
