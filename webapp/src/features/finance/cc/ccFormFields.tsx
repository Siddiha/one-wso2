/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * The form primitives the credit-card categorisation surfaces share.
 *
 * `CcEditDialog` grew its own copies of these first, and deliberately keeps
 * them for now: that dialog serves three screens (New, Pending Approvals,
 * Approve Submissions) and pointing it here would touch all three in a branch
 * that is meant to change one. Folding it onto this file is a follow-up, not
 * something to slip into a migration.
 */

import React, { useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import { ChevronDownIcon, CirclePlusIcon, FileIcon } from "@wso2/oxygen-ui-icons-react";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { describeError } from "../util/financeError";
import { formatNice, money } from "../util/financeFormat";
import { CC_SNACK } from "./ccCopy";
import { CC_ATTACHMENT_ACCEPT, CC_ATTACHMENT_MAX_BYTES, maxSizeLabel } from "../util/financeReceipts";
import type { CcFundingSource, CcTransaction } from "./ccTypes";

export function FieldLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Typography
      id={id}
      sx={{
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "text.disabled",
        fontWeight: 600,
        mb: 0.75,
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * A labelled control.
 *
 * The visible caption is a plain Typography, so without the `aria-labelledby`
 * wiring below a Select has no accessible name at all — a screen reader reads
 * "combo box" and nothing else. Done here so every field gets one.
 */
export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const labelId = React.useId();
  // Only the first element child is the control; a field may render helper
  // content after it (the travel job number carries its warnings inside).
  const items = React.Children.toArray(children);
  const controlIndex = items.findIndex((c) => React.isValidElement(c));
  const named = items.map((child, i) =>
    i === controlIndex && React.isValidElement(child)
      ? React.cloneElement(child as React.ReactElement<{ labelId?: string }>, { labelId })
      : child,
  );
  return (
    <Box>
      <FieldLabel id={labelId}>
        {label}
        {required && <Box component="span" sx={{ color: "error.main", ml: 0.25 }}>*</Box>}
      </FieldLabel>
      <FormControl size="small" fullWidth>
        {named}
      </FormControl>
    </Box>
  );
}

export function Placeholder() {
  return <span style={{ opacity: 0.6 }}>Select…</span>;
}

/**
 * EditPane.tsx:1229-1246 / InputMenu.tsx:150-177 — the source's Travel Job
 * Number is a typable Autocomplete, not a plain Select: the reader can type
 * "Hilton" to filter a long job list down instead of scrolling it. Not
 * `freeSolo` there either — the committed value still has to be one of the
 * pre-loaded job numbers, typing only narrows the list.
 *
 * `labelId` is what `Field` clones onto the first child to name a Select via
 * `aria-labelledby`; Select accepts that prop itself, Autocomplete does not,
 * so this wrapper takes it and forwards it onto the actual input instead.
 */
export function JobNumberAutocomplete({
  value,
  options,
  disabled,
  onChange,
  labelId,
}: {
  value: string | null;
  options: string[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
  labelId?: string;
}) {
  return (
    <Autocomplete
      size="small"
      options={options}
      value={value || null}
      disabled={disabled}
      onChange={(_e, v) => onChange(v)}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Select…"
          slotProps={{ htmlInput: { ...params.inputProps, "aria-labelledby": labelId } }}
        />
      )}
    />
  );
}

/**
 * A field the reader can only look at — the source's `StyledList` /
 * `StyledListItemText` pair (`EditPane.tsx:65-91`), a dashed box with the label
 * above and the value inside.
 *
 * Not a disabled input. Everything on a submitted transaction is read-only
 * until the reader presses Edit, and a screenful of greyed-out dropdowns reads
 * as "broken" rather than "settled" — the source draws these as text for
 * exactly that reason.
 *
 * `fallback` is per-field on purpose: the source says "(not entered)" for
 * something nobody filled in, "(not provided)" for something the system should
 * have supplied, and "(empty)" for a blank comment. They are user-visible and
 * easy to invent, so each caller passes the source's own wording.
 */
export function ReadOnlyField({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string | null | undefined;
  fallback: string;
}) {
  return (
    <Box
      sx={{
        border: "1.5px dashed",
        borderColor: "divider",
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        minWidth: 0,
      }}
    >
      <FieldLabel>{label}</FieldLabel>
      <Typography
        sx={{ fontSize: 12.5, fontWeight: value ? 600 : 400, color: value ? "text.primary" : "text.disabled" }}
        noWrap
        title={value ?? undefined}
      >
        {value || fallback}
      </Typography>
    </Box>
  );
}

/**
 * Who has had a submitted transaction and when — the source's "Submission
 * details" accordion (`EditPane.tsx:853-1101`), which it shows for any row that
 * has already gone somewhere and hides on one still being drafted.
 *
 * Collapsed by default (`:674`), because the reader opens this screen to
 * correct a row rather than to audit it; the six fields are reference material
 * for "why is this still sitting there".
 *
 * The fallbacks are the source's own and they differ by field on purpose — an
 * approver who has not acted yet is "(not approved yet)", one who was never
 * assigned is "(not assigned yet)".
 */
export function CcSubmissionDetails({ txn }: { txn: CcTransaction }) {
  const [open, setOpen] = useState(false);
  const date = (iso: string | null) => (iso ? formatNice(iso) : null);
  const cells: { label: string; value: string | null; fallback: string }[] = [
    { label: "Submitted User", value: txn.employeeEmail, fallback: "(not provided)" },
    // One lead, not the whole assigned list — `leadEmail` can carry several.
    { label: "Lead Approver", value: txn.leadEmail?.split(",")[0] ?? null, fallback: "(not assigned yet)" },
    { label: "Finance Approver", value: txn.financeApproverEmail, fallback: "(not approved yet)" },
    { label: "Submitted Date", value: date(txn.empPostedDate), fallback: "(not submitted)" },
    { label: "Lead Approved Date", value: date(txn.leadApprovedDate), fallback: "(not approved yet)" },
    { label: "Finance Approved Date", value: date(txn.financeApprovedDate), fallback: "(not approved yet)" },
  ];

  return (
    <Box>
      <Button
        size="small"
        variant="text"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        endIcon={<ChevronDownIcon size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />}
        sx={{ textTransform: "none", fontWeight: 600, fontSize: 12, color: "text.secondary", px: 0.5 }}
      >
        Submission details
      </Button>
      {/* `unmountOnExit`, so a collapsed trail is genuinely absent rather than
          present at zero height — otherwise a screen reader reads out six
          approval fields the sighted reader cannot see. */}
      <Collapse in={open} unmountOnExit>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 1.25,
            mt: 1,
          }}
        >
          {cells.map((c) => (
            <Box key={c.label} sx={{ minWidth: 0 }}>
              <FieldLabel>{c.label}</FieldLabel>
              <Typography
                sx={{ fontSize: 12, color: c.value ? "text.primary" : "text.disabled" }}
                noWrap
                title={c.value ?? undefined}
              >
                {c.value || c.fallback}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * A row of fields that lays itself out from the room it actually has.
 *
 * Not breakpoints: a breakpoint reads the VIEWPORT, and the categorise panel is
 * half of it — so `sm` fires while the panel is still only ~450px wide and the
 * fields get squashed, which is what went wrong when the window was resized.
 * `auto-fit` fits as many ~170px columns as the row can hold and wraps the
 * rest, so two fields sit side by side when there is room, three do when there
 * is more, and everything stacks when there is not.
 *
 * A component rather than an exported style object so this file keeps
 * exporting only components, which is what lets fast refresh work on it.
 */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 1.5 }}>
      {children}
    </Box>
  );
}

/**
 * One attachment slot: a single bordered field, label to icon — the icon
 * itself is the control. AttachmentButton.tsx:337-417 ("default full mode
 * with label + box"): unattached it is a plus circle that opens the file
 * picker; attached it becomes a file icon that opens the viewer instead.
 * Removing is not a control here at all — AttachmentButton.tsx:467-477 puts
 * it in the viewer, beside Download, not back on the form.
 */
export function AttachmentField({
  label,
  fileName,
  disabled,
  viewOnly,
  onPick,
  onView,
}: {
  label: string;
  fileName: string | null;
  disabled?: boolean;
  /**
   * Show only what is attached, and only let it be opened.
   *
   * `AttachmentButton.tsx:341-348` does the same on a submitted transaction:
   * viewing an existing file stays available while the row is read-only, but
   * the upload trigger is dead. Different from `disabled`, which greys the
   * control out but still shows it — here an empty slot is not offered at
   * all, since there is nothing to view and nothing this caller may attach.
   */
  viewOnly?: boolean;
  onPick: (file: File) => Promise<void>;
  onView: () => void;
}) {
  const { showSuccess, showError } = useNotifications();
  // AttachmentButton.tsx:77-80 — "local loading states specific to this
  // component instance". Receipt and Contract are two separate instances of
  // this component, each with its own local state, so uploading one never
  // shows the other as busy. A shared flag from a mutation both call sites
  // pass (`attachment.upload.isPending`) would flip on for whichever one is
  // NOT actually uploading too — the two fields visibly busy together for a
  // file only one of them is taking.
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const has = Boolean(fileName);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // AttachmentButton.tsx caps at 5 MB and says so before any upload starts.
    if (file.size > CC_ATTACHMENT_MAX_BYTES) {
      showError(`File must be ${maxSizeLabel(CC_ATTACHMENT_MAX_BYTES)} or smaller.`);
      // Clear the input on the way out. Left set, picking the SAME oversized
      // file again fires no change event, so the second attempt would look like
      // nothing happened at all — no message, no upload.
      if (input.current) input.current.value = "";
      return;
    }
    setUploading(true);
    try {
      await onPick(file);
      showSuccess(CC_SNACK.success.uploadAttachment);
    } catch (err) {
      showError(describeError(err));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  // AttachmentButton.tsx:339-348 — the source's own wording, by mode.
  const title = viewOnly
    ? has
      ? `View Attach ${label}`
      : `No attach ${label}`
    : has
      ? `View ${label}`
      : `Attach ${label}`;
  const fieldDisabled = (viewOnly && !has) || disabled || uploading;

  return (
    <Box>
      <input
        ref={input}
        type="file"
        accept={CC_ATTACHMENT_ACCEPT}
        onChange={handle}
        style={{ display: "none" }}
      />
      {/* Nothing to describe until a file is attached — no target for a
          picker to point at yet, so the tooltip stays off until `has`. */}
      <Tooltip
        describeChild
        title={title}
        arrow
        disableHoverListener={!has}
        disableFocusListener={!has}
        disableTouchListener={!has}
        slotProps={{
          tooltip: { sx: { fontSize: 10.5, px: 1, py: 0.5 } },
          popper: { modifiers: [{ name: "offset", options: { offset: [0, -14] } }] },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 50,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.5,
            pl: 1.75,
            pr: 0.75,
          }}
        >
          <Typography sx={{ fontSize: 13.5 }}>{label}</Typography>
          <IconButton
            size="small"
            aria-label={title}
            onClick={() => {
              if (has) onView();
              else input.current?.click();
            }}
            disabled={fieldDisabled}
          >
            {uploading ? (
              <CircularProgress size={18} />
            ) : has ? (
              <FileIcon size={18} />
            ) : (
              <CirclePlusIcon size={18} />
            )}
          </IconButton>
        </Box>
      </Tooltip>
    </Box>
  );
}

/**
 * The shares a travel job is funded from, and what this transaction costs each
 * of them — `FundingSourceTable.tsx`, whose Amount column is
 * `(percentage / 100) * txnAmount`.
 */
export function FundingSources({
  sources,
  totalAmount,
}: {
  sources: CcFundingSource[];
  totalAmount: number;
}) {
  return (
    <Box sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 1, overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {["Region", "Sub Region", "Business Unit", "Product Unit", "Percentage", "Amount"].map((h) => (
              <TableCell key={h} sx={{ fontSize: 10.5, fontWeight: 700, color: "text.disabled" }}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sources.map((f, i) => (
            <TableRow key={i}>
              <TableCell sx={{ fontSize: 11.5 }}>{f.region}</TableCell>
              <TableCell sx={{ fontSize: 11.5 }}>{f.subRegion}</TableCell>
              <TableCell sx={{ fontSize: 11.5 }}>{f.businessUnit}</TableCell>
              <TableCell sx={{ fontSize: 11.5 }}>{f.productUnit}</TableCell>
              <TableCell sx={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                {f.percentage}%
              </TableCell>
              <TableCell sx={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
                {money((f.percentage / 100) * totalAmount, "USD")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
