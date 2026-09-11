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

import type { ReactNode } from "react";
import {
  Box,
  Checkbox,
  CircularProgress,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  Typography,
} from "@wso2/oxygen-ui";

// The pieces the three analytics views share. Marketing Ops had these duplicated
// across MarketingDashboard / RoiReporting / LinkedInRoiReporting — three copies
// of StatCard, two of SectionTitle, three near-identical header-cell style
// objects. One copy each here.
//
// The theme-aware style hooks live in ./useChartStyles so this module exports
// only components (Fast Refresh requirement).

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="h2"
      sx={{
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: "-0.01em",
        color: "text.primary",
        mb: 1.5,
        mt: 4,
      }}
    >
      {children}
    </Typography>
  );
}

// Small uppercase label above a row of stat cards.
export function StripLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.13em",
        textTransform: "uppercase",
        color: "text.secondary",
        mb: 1,
        mt: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

// One figure in a KPI row. The `accent` bar along the top is what distinguishes
// spend (the money) from the funnel counts at a glance.
export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1.25, overflow: "hidden" }}>
      {accent && <Box sx={{ height: 3, bgcolor: accent }} />}
      <Box sx={{ px: 1.5, py: 1.5 }}>
        <Typography
          sx={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.13em",
            textTransform: "uppercase",
            color: "text.secondary",
            mb: 0.5,
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            fontSize: 19,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

// Progress state for a report run. These take seconds (live Google Ads +
// Salesforce queries), so the message rotates to show it hasn't stalled —
// carried over from Marketing Ops' LoadingBar, minus its animated bar.
export function ReportLoading({ messages }: { messages: readonly string[] }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", py: 6, justifyContent: "center" }}>
      <CircularProgress size={16} />
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{messages[0]}</Typography>
    </Stack>
  );
}

// Nothing selected / nothing to show yet.
export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ fontSize: 13, color: "text.disabled", py: 8, textAlign: "center" }}>
      {children}
    </Typography>
  );
}

// A small pill used for the platform toggle and the ROI breakdown selector.
// Deliberately a <button> rather than the clickable <Box> Marketing Ops used —
// these are controls, and they need keyboard focus and a pressed state.
export function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      sx={{
        px: 1.5,
        py: 0.6,
        borderRadius: 1,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        border: 1,
        transition: "all .12s ease",
        borderColor: active ? "primary.main" : "divider",
        color: active ? "primary.main" : "text.secondary",
        bgcolor: active ? "action.selected" : "transparent",
        "&:hover": { borderColor: "primary.main", color: "primary.main" },
      }}
    >
      {label}
    </Box>
  );
}

// Multi-value filter (region / business unit, and the ROI subtotal "Show"
// filter) — narrows the underlying data before any breakdown grouping is
// applied. Empty selection = no filter (all values). Ported from Marketing
// Ops' MultiFilter, rebuilt on Oxygen UI's Select instead of raw MUI.
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  // Overrides for the ROI subtotal "Show" filter, whose placeholder/count text
  // names the subtotal dimension rather than repeating the field label (e.g.
  // field label "Show", placeholder "All Region", count "2 of 5 selected").
  emptyLabel,
  selectedLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyLabel?: string;
  selectedLabel?: (count: number, total: number) => string;
}) {
  return (
    <Box>
      <FieldLabel>{label}</FieldLabel>
      <Select
        multiple
        size="small"
        displayEmpty
        value={selected}
        onChange={(e) => {
          const v = e.target.value as string | string[];
          onChange(typeof v === "string" ? v.split(",") : v);
        }}
        input={<OutlinedInput />}
        inputProps={{ "aria-label": label }}
        renderValue={(sel) => {
          const arr = sel as string[];
          if (arr.length === 0) return emptyLabel ?? `All ${label.toLowerCase()}s`;
          return selectedLabel ? selectedLabel(arr.length, options.length) : `${arr.length} selected`;
        }}
        sx={{ fontSize: 12.5, minWidth: 170 }}
      >
        {options.map((o) => (
          <MenuItem key={o} value={o} dense>
            <Checkbox checked={selected.includes(o)} size="small" sx={{ py: 0 }} />
            <ListItemText primary={o} slotProps={{ primary: { fontSize: 13 } }} />
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "text.secondary",
        mb: 0.75,
      }}
    >
      {children}
    </Typography>
  );
}
