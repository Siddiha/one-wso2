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
import { Autocomplete, Box, Button, Checkbox, Chip, Stack, TextField, Tooltip } from "@wso2/oxygen-ui";
import type { InvoiceMappingFilter, InvoiceMappingFilterOptions } from "./invoiceMappingFilters";

/**
 * The four filters above the invoice account mapping table.
 *
 * No Apply button, unlike the expense-type bar: these narrow rows already on
 * screen, so there is no request to issue and waiting for a click would only
 * be in the way.
 *
 * Status is not here. It is a "Show Inactive" switch beside the table, since
 * the active mappings are what a reader wants almost every time and that is
 * not worth opening a panel for.
 */

// Matches the expense-type bar, so the two read as one screen.
const FILTER_GRID_SX = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 1.5,
  mb: 1.5,
} as const;

/**
 * One row of chips, however many are selected.
 *
 * A multi-select grows a row taller per chip by default, which on four
 * filters side by side pushes the table off the screen — and the box that
 * grew is the one you are least likely to be reading. So the row stays one
 * line high and the chips past the first few become a `+n`.
 *
 * Truncating rather than scrolling sideways: the clear and dropdown buttons
 * are positioned over the right-hand end of this row, so a row that scrolled
 * would carry them out of reach. Everything selected is readable in the
 * dropdown, which lists it first and ticked, and in this row's tooltip.
 */
const FIELD_SX = {
  minWidth: 0,
  "& .MuiAutocomplete-inputRoot": { flexWrap: "nowrap", overflow: "hidden" },
  "& .MuiAutocomplete-tag": { flexShrink: 0, maxWidth: 120 },
} as const;

/** Chips a filter box shows before the rest become a `+n`. */
const MAX_FILTER_CHIPS = 2;

/** Multi-select over plain strings, with what is already picked listed first. */
function StringFilter({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: readonly string[];
  onChange: (next: string[]) => void;
}) {
  // What was selected when the list was last opened. The order is settled
  // from this rather than from `values`, so picking a second option does not
  // re-sort the list under the pointer and move the next one away mid-click.
  const [pinned, setPinned] = useState<readonly string[]>([]);
  const ordered = useMemo(
    () => [...options.filter((o) => pinned.includes(o)), ...options.filter((o) => !pinned.includes(o))],
    [options, pinned],
  );

  return (
    <Autocomplete
      multiple
      size="small"
      sx={FIELD_SX}
      options={ordered}
      value={values}
      // Picking one of several is the normal case here, so the list stays
      // open rather than having to be reopened for each.
      disableCloseOnSelect
      onOpen={() => setPinned(values)}
      onChange={(_e, next) => onChange(next as string[])}
      renderTags={(tags, getTagProps) => {
        const shown = tags.slice(0, MAX_FILTER_CHIPS);
        const hiddenCount = tags.length - shown.length;
        return [
          ...shown.map((tag, index) => (
            <Chip {...getTagProps({ index })} key={tag} label={tag} size="small" />
          )),
          // Not deletable, and not one of the tags: it stands for the rest of
          // them, so there is nothing for an `x` on it to remove.
          hiddenCount > 0 ? (
            <Tooltip key="more" arrow title={tags.join(", ")}>
              <Chip label={`+${hiddenCount}`} size="small" variant="outlined" />
            </Tooltip>
          ) : null,
        ];
      }}
      // A tick, because with the selected options lifted to the top of the
      // list there is otherwise nothing saying why they are up there.
      renderOption={({ key, ...props }, option, { selected }) => (
        <li key={key} {...props}>
          <Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0.5 }} />
          {option}
        </li>
      )}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}

export default function InvoiceAccountMappingFilters({
  filter,
  options,
  activeCount,
  onChange,
  onClear,
}: {
  filter: InvoiceMappingFilter;
  options: InvoiceMappingFilterOptions;
  activeCount: number;
  onChange: (next: InvoiceMappingFilter) => void;
  onClear: () => void;
}) {
  // An emptied key is dropped rather than left as `[]`, so "no cost type
  // filter" has one representation however it was arrived at.
  const set = <K extends keyof InvoiceMappingFilter>(key: K, value: string[]) => {
    const next = { ...filter };
    if (value.length === 0) delete next[key];
    else next[key] = value;
    onChange(next);
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={FILTER_GRID_SX}>
        <StringFilter
          label="Cost Type"
          values={filter.costTypes ?? []}
          options={options.costTypes}
          onChange={(v) => set("costTypes", v)}
        />
        <StringFilter
          label="Engagement Code"
          values={filter.engagementCodes ?? []}
          options={options.engagementCodes}
          onChange={(v) => set("engagementCodes", v)}
        />
        <StringFilter
          label="Engagement Code Suffix"
          values={filter.engagementCodeSuffixes ?? []}
          options={options.engagementCodeSuffixes}
          onChange={(v) => set("engagementCodeSuffixes", v)}
        />
        <StringFilter
          label="Department"
          values={filter.departments ?? []}
          options={options.departments}
          onChange={(v) => set("departments", v)}
        />
      </Box>
      <Stack direction="row" gap={1}>
        <Button
          variant="outlined"
          color="error"
          size="small"
          onClick={onClear}
          disabled={activeCount === 0}
        >
          Clear
        </Button>
      </Stack>
    </Box>
  );
}
