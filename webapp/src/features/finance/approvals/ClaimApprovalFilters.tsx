/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { FilterIcon, XIcon } from "@wso2/oxygen-ui-icons-react";
import { withLoadingAdornment } from "@components/picker-loading/pickerLoading";
import {
  hasActiveClaimFilters,
  type ClaimApprovalDraftFilters,
  type ClaimEntityOption,
  type ClaimKind,
} from "./claimSearch";

/**
 * The Advanced Filter panel for both approval queues, built to the same shape
 * as the Expense dashboard's: one right-aligned button opening a popover, a
 * draft that only takes effect on Apply, and a Reset beside it.
 *
 * Draft-then-Apply for the same reason it exists there — `employee` and
 * `claimId` are query parameters, so every keystroke applied live would start a
 * fresh request and blank the list under the reader's hands. Claim type rides
 * along in the draft purely so the panel reads as one decision, even though it
 * costs nothing to apply.
 *
 * The search box deliberately does NOT live in here. It narrows rows already on
 * screen, so it is instant; behind a popover and an Apply click it would be
 * slower than the list it is meant to cut down.
 */
function sameFilters(a: ClaimApprovalDraftFilters, b: ClaimApprovalDraftFilters): boolean {
  return (
    a.employee === b.employee &&
    a.claimId === b.claimId &&
    a.kind === b.kind &&
    a.entityCode === b.entityCode
  );
}

/** The claim types offered, in the order they read. "All" is the absence of a
 *  choice rather than an option, so this field clears like the others. */
const CLAIM_KIND_OPTIONS: { value: ClaimKind; label: string }[] = [
  { value: "opd", label: "OPD Claims" },
  { value: "expense", label: "Expense Claims" },
];

export function ClaimApprovalFilters({
  draft,
  applied,
  onDraftChange,
  onApply,
  onClear,
  employeeOptions,
  employeesLoading,
  /** False on the lead stage and for anyone without the OPD role, where only
   *  one claim type can ever appear and the choice would be a dead control. */
  showsKindFilter,
  entityOptions,
}: {
  draft: ClaimApprovalDraftFilters;
  applied: ClaimApprovalDraftFilters;
  onDraftChange: (next: ClaimApprovalDraftFilters) => void;
  onApply: () => void;
  onClear: () => void;
  employeeOptions: string[];
  employeesLoading: boolean;
  showsKindFilter: boolean;
  /** Legal entities the people in these queues belong to. Empty while the
   *  directory or the subsidiary master data is still loading, which hides the
   *  field rather than offering an empty dropdown. */
  entityOptions: ClaimEntityOption[];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  const set = <K extends keyof ClaimApprovalDraftFilters>(
    key: K,
    value: ClaimApprovalDraftFilters[K],
  ) => onDraftChange({ ...draft, [key]: value });

  // Dirty against what is APPLIED, not against empty: reopening the panel on
  // filters already in force must not look like unsaved changes.
  const isDirty = !sameFilters(draft, applied);
  const isActive = hasActiveClaimFilters(applied);

  const applyAndClose = () => {
    onApply();
    close();
  };
  const resetAndClose = () => {
    onClear();
    close();
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="text"
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchor)}
          onClick={(e) => setAnchor(e.currentTarget)}
          endIcon={<FilterIcon size={16} />}
          sx={{ textTransform: "none", fontSize: 15, fontWeight: 500 }}
        >
          Advanced Filter
        </Button>
      </Box>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 340, p: 2.5, mt: 1 } } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Advanced Filter</Typography>
          <IconButton aria-label="Close filters" size="small" onClick={close}>
            <XIcon size={18} />
          </IconButton>
        </Stack>

        <Stack gap={2}>
          {/* Every narrowing field is an Autocomplete, so each one can be typed
              into OR picked from, and all four behave the same way: the label
              sits inside until something is chosen, then floats, with an X to
              clear. The earlier selects always held a sentinel value ("All
              Claim Types"), which kept their labels permanently floated while
              the others' sat inside — the same panel reading two ways.

              "No choice" is null here rather than an "All ..." option: the
              clear button already says it, and a sentinel row made the two
              dropdowns disagree with the two text fields. */}
          {showsKindFilter && (
            <Autocomplete
              size="small"
              options={CLAIM_KIND_OPTIONS}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, value) => option.value === value.value}
              value={CLAIM_KIND_OPTIONS.find((o) => o.value === draft.kind) ?? null}
              onChange={(_e, v) => set("kind", v?.value ?? "all")}
              renderInput={(params) => <TextField {...params} label="Filter by Claim Type" />}
            />
          )}

          {entityOptions.length > 0 && (
            <Autocomplete
              size="small"
              options={entityOptions}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, value) => option.code === value.code}
              value={entityOptions.find((o) => o.code === draft.entityCode) ?? null}
              onChange={(_e, v) => set("entityCode", v?.code ?? "")}
              renderInput={(params) => <TextField {...params} label="Filter by Entity" />}
            />
          )}

          <Autocomplete
            size="small"
            options={employeeOptions}
            value={draft.employee}
            onChange={(_e, v) => set("employee", v)}
            loading={employeesLoading}
            disabled={employeesLoading}
            renderInput={(params) => (
              <TextField
                {...withLoadingAdornment(params, employeesLoading)}
                label="Filter by Email"
              />
            )}
          />

          <TextField
            fullWidth
            size="small"
            label="Filter by Claim ID"
            value={draft.claimId}
            onChange={(e) => set("claimId", e.target.value)}
          />
        </Stack>

        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 2.5 }}>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={resetAndClose}
            disabled={!isActive && !isDirty}
          >
            Reset
          </Button>
          <Button variant="contained" size="small" onClick={applyAndClose} disabled={!isDirty}>
            Apply
          </Button>
        </Stack>
      </Popover>

      {isDirty && (
        <Typography
          sx={{ fontSize: 13, fontWeight: 600, color: "warning.main", mt: 1, textAlign: "right" }}
        >
          Filters changed — apply to refresh
        </Typography>
      )}
    </Box>
  );
}
