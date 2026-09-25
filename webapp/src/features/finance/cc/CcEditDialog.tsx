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

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import { CirclePlusIcon, FileIcon } from "@wso2/oxygen-ui-icons-react";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { useAccessToken } from "@hooks/useAccessToken";
import { ccServiceUrls } from "@config/apiConfig";
import { ReceiptViewer } from "../components/ReceiptViewer";
import { describeError } from "../util/financeError";
import { CC_SNACK } from "./ccCopy";
import { money, formatNice } from "../util/financeFormat";
import {
  CC_ATTACHMENT_ACCEPT,
  CC_ATTACHMENT_MAX_BYTES,
  fetchBase64Attachment,
  maxSizeLabel,
  type ReceiptSource,
} from "../util/financeReceipts";
import { useCcJobNumberDetails, useCcMenus } from "./useCc";
import { useCcAttachment } from "./useCcMutations";
import { JobNumberAutocomplete } from "./ccFormFields";
import { CcFundingSource,
  CC_MARKETING_CATEGORY,
  CC_TRAVEL_CATEGORY,
  ccTxnComplete,
  type CcTransaction,
} from "./ccTypes";

const COMMENT_MAX = 30;

// Categorise one credit-card transaction: expense category → type, comment,
// and the unit/region/job-number fields the chosen category requires.
export function CcEditDialog({
  txn,
  financeAdmin,
  leadList,
  onClose,
  onSave,
}: {
  txn: CcTransaction | null;
  /**
   * The viewer is acting as finance. Only the approve queue passes this, and
   * only it changes what a row still with its lead may have done to it — see
   * `leadOnly` below.
   */
  financeAdmin?: boolean;
  /** Who a submission could be re-pointed at. Finance only. */
  leadList?: string[];
  onClose: () => void;
  onSave: (patched: CcTransaction) => void;
}) {
  return txn ? (
    <CcEditForm
      key={txn.id}
      txn={txn}
      financeAdmin={financeAdmin}
      leadList={leadList}
      onClose={onClose}
      onSave={onSave}
    />
  ) : null;
}

function CcEditForm({
  txn,
  financeAdmin,
  leadList,
  onClose,
  onSave,
}: {
  txn: CcTransaction;
  financeAdmin?: boolean;
  leadList?: string[];
  onClose: () => void;
  onSave: (patched: CcTransaction) => void;
}) {
  const menus = useCcMenus();
  const { showSuccess } = useNotifications();
  const [category, setCategory] = useState(txn.expenseCategoryLabel ?? "");
  const [typeLabel, setTypeLabel] = useState(txn.expenseTypeLabel ?? "");
  const [comment, setComment] = useState(txn.txnComment ?? "");
  // Product/business unit is picked as an index into the aligned arrays;
  // starts blank (the arrays load async, so a prior value is re-selected).
  const [unitIndex, setUnitIndex] = useState<number | "">("");
  const [subRegion, setSubRegion] = useState(txn.subRegion ?? "");
  const [jobNumber, setJobNumber] = useState(txn.travelJobNumber ?? "");
  const [receiptFileName, setReceiptFileName] = useState(txn.receiptFileName);
  const [contractFileName, setContractFileName] = useState(txn.contractFileName);
  // The source shows and writes the FIRST lead of what may be a comma-separated
  // list (`EditPane.tsx:1448-1453`), replacing the whole list with the one
  // chosen. Kept verbatim: the backend routes to whoever is named here.
  const [leadEmail, setLeadEmail] = useState(txn.leadEmail?.split(",")[0]?.trim() ?? "");
  const attachment = useCcAttachment();
  const getAccessToken = useAccessToken();
  const [load, setLoad] = useState<(() => Promise<ReceiptSource>) | null>(null);
  // Which attachment the viewer is open on — needed alongside `load` so the
  // viewer's own Remove button (AttachmentButton.tsx:467-477) can be wired to
  // the right one.
  const [viewingType, setViewingType] = useState<"receipt" | "contract" | null>(null);

  const viewAttachment = (attachmentType: "receipt" | "contract") => {
    setViewingType(attachmentType);
    // A loader, not a loaded source: ReceiptViewer fetches when it opens.
    // fetchBase64Attachment, not fetchReceiptObjectUrl — this endpoint
    // returns base64, not bytes.
    setLoad(() => async () =>
      fetchBase64Attachment(ccServiceUrls.attachment(txn.id, attachmentType), await getAccessToken()),
    );
  };

  /**
   * Finance, looking at a transaction that has not reached it yet.
   *
   * `EditPane.tsx:659-670` — finance may re-point such a row at a different
   * lead and may change **nothing else** about it: the categorisation is still
   * the card holder's and their lead's to settle. Once the row is
   * `pending_finance` the reverse holds — the lead field disappears and
   * everything else opens up.
   *
   * The port had no way into this at all: `canEdit` only ever offered finance a
   * `pending_finance` row, so a submission sitting on the wrong lead had no way
   * forward short of the lead acting.
   */
  const leadOnly = Boolean(financeAdmin) && txn.status === "pending_lead";

  const categories = menus.expenseTypes.data?.categories ?? [];
  const typeOptions = category ? menus.expenseTypes.data?.types[category] ?? [] : [];
  const subRegions = menus.subRegions.data?.subRegions ?? [];
  const jobNumbers = menus.jobNumbers.data?.jobNumbers ?? [];
  const productUnits = menus.units.data?.productUnits ?? [];
  const businessUnits = menus.units.data?.businessUnits ?? [];

  const unitOptions = useMemo(
    () => productUnits.map((pu, i) => ({ i, label: `${pu} — ${businessUnits[i] ?? ""}` })),
    [productUnits, businessUnits],
  );

  // Re-select the transaction's stored product/business unit once the
  // aligned unit arrays load. Without this, editing an already-categorised
  // non-travel transaction would blank the unit (Save stays disabled) until
  // the user re-picks it.
  useEffect(() => {
    if (unitIndex !== "" || !txn.productUnit) return;
    const i = productUnits.findIndex(
      (pu, idx) => pu === txn.productUnit && businessUnits[idx] === txn.businessUnit,
    );
    if (i >= 0) setUnitIndex(i);
  }, [productUnits, businessUnits, txn.productUnit, txn.businessUnit, unitIndex]);

  const isTravel = category === CC_TRAVEL_CATEGORY;
  // EditPane.tsx:364 matches with startsWith, so a sub-category such as
  // "Marketing - Digital" still needs a sub-region.
  const isMarketing = category?.startsWith(CC_MARKETING_CATEGORY) ?? false;

  // EditPane.tsx:560-600 — the job number decides a travel transaction's units.
  // Fetched only while Travel is selected; the row keeps its stored units until
  // the details arrive, so a slow lookup never blanks them.
  const jobDetails = useCcJobNumberDetails(isTravel && jobNumber ? jobNumber : undefined);
  const jobUnits = isTravel ? jobDetails.data : undefined;
  const fundingSources = jobUnits?.fundingSources ?? [];
  // :568-575 — a job with no funding sources cannot be charged against, so the
  // source refuses to apply it rather than filling in half the row.
  const jobUnusable = Boolean(jobUnits) && fundingSources.length === 0;
  // :591-598 — a job can also come back without units. The source warns and
  // saves anyway: validateRequiredFields (utils.ts:59-64) asks Travel only for
  // a job number, comment and expense type, never for the units. So this is a
  // warning, not a block — Save stays enabled.
  const jobMissingUnits = Boolean(jobUnits) && !(jobUnits?.productUnit && jobUnits?.businessUnit);
  const jobUsable = Boolean(jobUnits) && fundingSources.length > 0;

  const edited: CcTransaction = {
    ...txn,
    expenseCategoryLabel: category || null,
    expenseTypeLabel: typeLabel || null,
    txnComment: comment || null,
    travelJobNumber: isTravel ? jobNumber || null : null,
    subRegion: isMarketing ? subRegion || null : null,
    // :577-590 — for travel the job's own units win; the user never picks them.
    productUnit: isTravel
      ? (jobUsable ? jobUnits?.productUnit ?? null : txn.productUnit)
      : unitIndex === ""
        ? null
        : productUnits[unitIndex] ?? null,
    businessUnit: isTravel
      ? (jobUsable ? jobUnits?.businessUnit ?? null : txn.businessUnit)
      : unitIndex === ""
        ? null
        : businessUnits[unitIndex] ?? null,
    receiptFileName,
    contractFileName,
  };

  /**
   * What Save would write.
   *
   * In `leadOnly` the patch is built from the ROW, not from the form, and only
   * the lead moves. The form's controls are disabled there but their state is
   * still live, and the units are the problem: `unitIndex` only resolves once
   * the aligned menu arrays have loaded and still contain this row's exact
   * pair. Until then — or ever, if the pair has since been reorganised away —
   * it reads empty, which would carry `productUnit: null` into the patch.
   *
   * That did two things, both bad. `ccTxnComplete` then failed, so Save stayed
   * disabled and finance could not re-point the submission at all — the whole
   * point of this screen's edit. And had it saved, it would have wiped the
   * card holder's categorisation on the way past.
   */
  const patched: CcTransaction = leadOnly
    ? { ...txn, leadEmail: leadEmail || null }
    : edited;
  // A job with no funding sources is not applied, so it cannot complete the
  // row. Missing units deliberately do NOT block — see jobMissingUnits above.
  // Reassignment asks only for a lead, and a different one — the row's
  // categorisation is not this mode's to judge or to re-save unchanged.
  const valid = leadOnly
    ? Boolean(leadEmail) && leadEmail !== (txn.leadEmail?.split(",")[0]?.trim() ?? "")
    : ccTxnComplete(patched) && !jobUnusable;

  return (
    <>
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>
        Categorise transaction
        <Typography sx={{ fontSize: 12.5, color: "text.secondary", fontWeight: 400 }}>
          {txn.txnDescription} · {formatNice(txn.txnDate)} · {money(txn.txnAmount, "USD")}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
            <Field label="Expense category">
              <Select
                value={category}
                disabled={leadOnly}
                onChange={(e) => {
                  setCategory(String(e.target.value));
                  setTypeLabel(""); // types depend on category
                }}
                displayEmpty
                renderValue={(v) => (v ? String(v) : <Placeholder />)}
              >
                {categories.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
            </Field>
            <Field label="Expense type">
              <Select
                value={typeLabel}
                onChange={(e) => setTypeLabel(String(e.target.value))}
                disabled={leadOnly || !category}
                displayEmpty
                renderValue={(v) => (v ? String(v) : <Placeholder />)}
              >
                {typeOptions.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </Field>
          </Box>

          {isTravel ? (
            <Field label="Travel job number">
              <JobNumberAutocomplete
                value={jobNumber}
                options={jobNumbers}
                disabled={leadOnly}
                onChange={(v) => setJobNumber(v ?? "")}
              />
            {/* EditPane.tsx:568-598 warns on both, because either one leaves
                the row uncompletable and neither is the user's fault. */}
            {jobUnusable && (
              <Alert severity="warning" sx={{ mt: 1, fontSize: 12.5 }}>
                No funding sources found for the selected Job number.
              </Alert>
            )}
            {!jobUnusable && jobMissingUnits && (
              <Alert severity="warning" sx={{ mt: 1, fontSize: 12.5 }}>
                No Product unit and/or Business unit found for the selected Job number.
              </Alert>
            )}
            {jobUsable && jobUnits && (
              <Box sx={{ mt: 1 }}>
                {/* :629-641 — the engagement a travel spend is charged to. */}
                <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                  {jobUnits.engagementCode} · {jobUnits.engagementType} · {jobUnits.country}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                  Units from this job: {jobUnits.productUnit} — {jobUnits.businessUnit}
                </Typography>
                <FundingSources sources={fundingSources} totalAmount={txn.txnAmount} />
              </Box>
            )}
            </Field>
          ) : (
            <Field label="Product unit">
              <Select<number | "">
                value={unitIndex}
                disabled={leadOnly}
                onChange={(e) => setUnitIndex(e.target.value === "" ? "" : Number(e.target.value))}
                displayEmpty
                renderValue={(v) => (v === "" ? <Placeholder /> : unitOptions[Number(v)]?.label ?? String(v))}
              >
                {unitOptions.map((o) => (
                  <MenuItem key={o.i} value={o.i}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </Field>
          )}

          {isMarketing && (
            <Field label="Sub region">
              <Select
                value={subRegion}
                disabled={leadOnly}
                onChange={(e) => setSubRegion(String(e.target.value))}
                displayEmpty
                renderValue={(v) => (v ? String(v) : <Placeholder />)}
              >
                {subRegions.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </Field>
          )}

          {/* EditPane.tsx:1429-1457 — the one thing finance may change on a row
              still with its lead, and the only time this field exists at all.
              Once the row reaches finance it disappears and the rest unlocks. */}
          {leadOnly && (
            <Field label="Lead approver">
              <Select
                value={leadEmail}
                onChange={(e) => setLeadEmail(String(e.target.value))}
                displayEmpty
                renderValue={(v) => (v ? String(v) : <Placeholder />)}
              >
                {(leadList ?? []).map((l) => (
                  <MenuItem key={l} value={l}>
                    {l}
                  </MenuItem>
                ))}
              </Select>
            </Field>
          )}

          <Box>
            <FieldLabel>Comment</FieldLabel>
            <TextField
              size="small"
              fullWidth
              value={comment}
              disabled={leadOnly}
              onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
              placeholder="Short note for this transaction"
              helperText={`${comment.length}/${COMMENT_MAX}`}
              // The caption above is a plain Typography, so name the input.
              inputProps={{ "aria-label": "Comment" }}
            />
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
            <AttachmentField
              label="Receipt"
              fileName={receiptFileName}
              viewOnly={leadOnly}
              onView={() => viewAttachment("receipt")}
              onPick={async (file) => {
                const name = await attachment.upload.mutateAsync({ id: txn.id, attachmentType: "receipt", file });
                setReceiptFileName(name || file.name);
              }}
            />
            <AttachmentField
              label="Contract (optional)"
              fileName={contractFileName}
              viewOnly={leadOnly}
              onView={() => viewAttachment("contract")}
              onPick={async (file) => {
                const name = await attachment.upload.mutateAsync({ id: txn.id, attachmentType: "contract", file });
                setContractFileName(name || file.name);
              }}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>
          Cancel
        </Button>
        {/* EditPane.tsx:370-378 says this when a save is attempted with fields
            still empty. The port disables Save instead, which stops the
            pointless round trip but left the reason unsaid — so the source's
            line goes where it can still be read. */}
        <Tooltip title={valid ? "" : "Please fill in all required fields."}>
          <span>
            <Button size="small" variant="contained" disabled={!valid} onClick={() => onSave(patched)}>
              Save
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
    <ReceiptViewer
      title="Attachment"
      load={load}
      onClose={() => {
        setLoad(null);
        setViewingType(null);
      }}
      // AttachmentButton.tsx:467-477 — Remove lives in the viewer, not back
      // on the form, and only while the row is actually open to correction.
      onRemove={
        !leadOnly && viewingType
          ? async () => {
              await attachment.remove.mutateAsync({ id: txn.id, attachmentType: viewingType });
              if (viewingType === "receipt") setReceiptFileName(null);
              else setContractFileName(null);
              showSuccess(CC_SNACK.success.removeAttachment);
            }
          : undefined
      }
    />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // The visible caption is a plain Typography, so without this the control has
  // no accessible name at all — a screen reader reads "combo box" and nothing
  // else. MUI names a Select through aria-labelledby, so the caption gets an id
  // and the control is pointed at it. Done here, so every field gets one.
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
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <FormControl size="small" fullWidth>
        {named}
      </FormControl>
    </Box>
  );
}

function FieldLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Typography
      id={id}
      sx={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.disabled", fontWeight: 600, mb: 0.75 }}
    >
      {children}
    </Typography>
  );
}

/**
 * One attachment slot: a single bordered field, label to icon — the icon
 * itself is the control. AttachmentButton.tsx:337-417 ("default full mode
 * with label + box"): unattached it is a plus circle that opens the file
 * picker; attached it becomes a file icon that opens the viewer instead.
 * Removing lives in the viewer, beside Download — AttachmentButton.tsx:467-
 * 477 — not back on the form: this dialog used to manage it as a text
 * button here because it had no viewer at all, only "attached"/"none".
 */
function AttachmentField({
  label,
  fileName,
  viewOnly,
  onPick,
  onView,
}: {
  label: string;
  fileName: string | null;
  /**
   * Show what is attached and offer no way to change it —
   * `AttachmentButton.tsx:341-348`, which kills the upload trigger while a
   * row is not the viewer's to edit.
   */
  viewOnly?: boolean;
  onPick: (file: File) => Promise<void>;
  onView: () => void;
}) {
  const { showSuccess, showError } = useNotifications();
  // AttachmentButton.tsx:77-80 — "local loading states specific to this
  // component instance". Receipt and Contract are two separate instances of
  // this component, each with its own local state, so uploading one never
  // shows the other as busy.
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const has = Boolean(fileName);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > CC_ATTACHMENT_MAX_BYTES) {
      showError(`File must be ${maxSizeLabel(CC_ATTACHMENT_MAX_BYTES)} or smaller.`);
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

  return (
    <Box>
      <input ref={input} type="file" accept={CC_ATTACHMENT_ACCEPT} onChange={handle} style={{ display: "none" }} />
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
            disabled={(viewOnly && !has) || uploading}
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

function Placeholder() {
  return <span style={{ opacity: 0.6 }}>Select…</span>;
}

/**
 * The shares a travel job is funded from, and what this transaction costs each
 * of them — `FundingSourceTable.tsx`, whose Amount column is
 * `(percentage / 100) * txnAmount`.
 */
function FundingSources({
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
            {["Region", "Sub Region", "Business Unit", "Product Unit", "Percentage", "Amount"].map(
              (h) => (
                <TableCell key={h} sx={{ fontSize: 10.5, fontWeight: 700, color: "text.disabled" }}>
                  {h}
                </TableCell>
              ),
            )}
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
