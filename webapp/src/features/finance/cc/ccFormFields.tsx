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
  Box,
  Button,
  FormControl,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@wso2/oxygen-ui";
import { CheckIcon } from "@wso2/oxygen-ui-icons-react";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { describeError } from "../util/financeError";
import { money } from "../util/financeFormat";
import { CC_SNACK } from "./ccCopy";
import { CC_ATTACHMENT_ACCEPT, CC_ATTACHMENT_MAX_BYTES, maxSizeLabel } from "../util/financeReceipts";
import type { CcFundingSource } from "./ccTypes";

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
 * One attachment slot: upload, view, replace, remove.
 *
 * Viewing is what the port was missing here. The old dialog showed only
 * "attached" / "none", so a receipt uploaded from this screen could never be
 * looked at again from it — AttachmentButton.tsx opens the file in the source.
 */
export function AttachmentField({
  label,
  fileName,
  busy,
  disabled,
  onPick,
  onView,
  onRemove,
}: {
  label: string;
  fileName: string | null;
  busy: boolean;
  disabled?: boolean;
  onPick: (file: File) => Promise<void>;
  onView: () => void;
  onRemove: () => Promise<void>;
}) {
  const { showSuccess, showError } = useNotifications();
  const [removing, setRemoving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const remove = async () => {
    setRemoving(true);
    try {
      await onRemove();
      showSuccess(CC_SNACK.success.removeAttachment);
    } catch (err) {
      showError(describeError(err));
    } finally {
      setRemoving(false);
    }
  };

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // AttachmentButton.tsx caps at 5 MB and says so before any upload starts.
    if (file.size > CC_ATTACHMENT_MAX_BYTES) {
      showError(`File must be ${maxSizeLabel(CC_ATTACHMENT_MAX_BYTES)} or smaller.`);
      return;
    }
    try {
      await onPick(file);
      showSuccess(CC_SNACK.success.uploadAttachment);
    } catch (err) {
      showError(describeError(err));
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Box>
      <FieldLabel>{label}</FieldLabel>
      <input
        ref={input}
        type="file"
        accept={CC_ATTACHMENT_ACCEPT}
        onChange={handle}
        style={{ display: "none" }}
      />
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => input.current?.click()}
          disabled={busy || disabled}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {busy ? "Uploading…" : fileName ? "Replace" : "Upload"}
        </Button>
        {fileName && (
          <>
            <Button
              size="small"
              variant="text"
              onClick={onView}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              View
            </Button>
            <Button
              size="small"
              variant="text"
              color="error"
              onClick={remove}
              disabled={busy || removing || disabled}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              {removing ? "Removing…" : "Remove"}
            </Button>
          </>
        )}
        <Typography
          sx={{
            fontSize: 12,
            color: fileName ? "success.main" : "text.disabled",
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
          }}
          noWrap
        >
          {fileName && (
            <CheckIcon size={13} style={{ color: "var(--oxygen-palette-success-main)", flexShrink: 0 }} />
          )}
          {fileName ? "attached" : "none"}
        </Typography>
      </Stack>
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
