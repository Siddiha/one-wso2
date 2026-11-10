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
import { Box, Button, IconButton, MenuItem, Popover, Stack, TextField, Typography } from "@wso2/oxygen-ui";
import { FilterIcon, XIcon } from "@wso2/oxygen-ui-icons-react";
import { EXPENSE_DASHBOARD_PERIODS, type ExpenseDashboardPeriod } from "../expenseTypes";
import { ALL_CATEGORIES, ALL_EMPLOYEES, ALL_ENTITIES, ALL_REGIONS, ALL_STATUSES } from "./expenseDashboardUtils";

export interface ExpenseDashboardDraftFilters {
  /** Part of the draft, not applied on selection: a period picked in the panel
   *  only takes effect once Apply is pressed, like every other filter. */
  period: ExpenseDashboardPeriod;
  entity: string;
  region: string;
  category: string;
  /** The employee's work email, not their name: names repeat across the
   *  company, emails don't. The panel shows the name. */
  employee: string;
  status: string;
  /** Only read when the period is Custom; kept here so a half-typed range
   *  never triggers a request before Apply is pressed. */
  startDate: string;
  endDate: string;
}

/**
 * One labelled dropdown inside the Advanced Filter panel. Every option list
 * starts with its "All ..." sentinel, so an unset filter is a real, displayable
 * value rather than an empty field. `optionLabel` shows an option as something
 * other than its raw value, while the value itself stays what gets filtered on.
 */
function FilterSelect({
  label,
  value,
  options,
  optionLabel = (option) => option,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  optionLabel?: (option: string) => string;
  onChange: (next: string) => void;
}) {
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          {optionLabel(option)}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function ExpenseDashboardFilters({
  draft,
  onDraftChange,
  isDirty,
  isRangeInvalid,
  hasActiveFilters,
  entityOptions,
  regionOptions,
  categoryOptions,
  employeeOptions,
  employeeLabel,
  statusOptions,
  statusLabel,
  onApply,
  onClear,
}: {
  draft: ExpenseDashboardDraftFilters;
  onDraftChange: (next: ExpenseDashboardDraftFilters) => void;
  isDirty: boolean;
  isRangeInvalid: boolean;
  hasActiveFilters: boolean;
  entityOptions: readonly string[];
  regionOptions: readonly string[];
  categoryOptions: readonly string[];
  employeeOptions: readonly string[];
  employeeLabel: (email: string) => string;
  statusOptions: readonly string[];
  statusLabel: (status: string) => string;
  onApply: () => void;
  onClear: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const set = <K extends keyof ExpenseDashboardDraftFilters>(key: K, value: ExpenseDashboardDraftFilters[K]) =>
    onDraftChange({ ...draft, [key]: value });

  const close = () => setAnchor(null);
  const applyAndClose = () => {
    onApply();
    close();
  };
  const resetAndClose = () => {
    onClear();
    close();
  };

  return (
    <Box sx={{ mb: 2 }}>
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
          <FilterSelect
            label="Filter by Business Entity"
            value={draft.entity}
            options={[ALL_ENTITIES, ...entityOptions]}
            onChange={(v) => set("entity", v)}
          />
          <FilterSelect
            label="Filter by Sales Region"
            value={draft.region}
            options={[ALL_REGIONS, ...regionOptions]}
            onChange={(v) => set("region", v)}
          />
          <FilterSelect
            label="Filter by Expense Category"
            value={draft.category}
            options={[ALL_CATEGORIES, ...categoryOptions]}
            onChange={(v) => set("category", v)}
          />
          <FilterSelect
            label="Filter by Employee"
            value={draft.employee}
            options={[ALL_EMPLOYEES, ...employeeOptions]}
            optionLabel={(option) => (option === ALL_EMPLOYEES ? option : employeeLabel(option))}
            onChange={(v) => set("employee", v)}
          />
          <FilterSelect
            label="Filter by Status"
            value={draft.status}
            options={[ALL_STATUSES, ...statusOptions]}
            optionLabel={(option) => (option === ALL_STATUSES ? option : statusLabel(option))}
            onChange={(v) => set("status", v)}
          />
          <FilterSelect
            label="Filter by Period"
            value={draft.period}
            options={EXPENSE_DASHBOARD_PERIODS}
            onChange={(v) => set("period", v as ExpenseDashboardPeriod)}
          />

          {draft.period === "Custom" && (
            <Stack direction="row" gap={1.5}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="From"
                value={draft.startDate}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: draft.endDate || undefined } }}
                onChange={(e) => set("startDate", e.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                type="date"
                label="To"
                value={draft.endDate}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: draft.startDate || undefined } }}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </Stack>
          )}
        </Stack>

        {isRangeInvalid && (
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "error.main", mt: 2 }}>
            Pick a From date on or before the To date.
          </Typography>
        )}

        <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 2.5 }}>
          <Button variant="outlined" color="error" size="small" onClick={resetAndClose} disabled={!hasActiveFilters}>
            Reset
          </Button>
          <Button variant="contained" size="small" onClick={applyAndClose} disabled={!isDirty || isRangeInvalid}>
            Apply
          </Button>
        </Stack>
      </Popover>

      {isDirty && !isRangeInvalid && (
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: "warning.main", mt: 1, textAlign: "right" }}>
          Filters changed — apply to refresh
        </Typography>
      )}
    </Box>
  );
}
