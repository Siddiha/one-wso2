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

import React, { useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import { useAccessToken } from "@hooks/useAccessToken";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { ccServiceUrls } from "@config/apiConfig";
import { ReceiptViewer } from "../components/ReceiptViewer";
import { DraftStatusChip } from "../components/DraftStatusChip";
import { useDraftAutosave } from "../util/useDraftAutosave";
import { fetchBase64Attachment, type ReceiptSource } from "../util/financeReceipts";
import { bareAmount, formatNice } from "../util/financeFormat";
import {
  AttachmentField,
  CcSubmissionDetails,
  Field,
  FieldLabel,
  FieldRow,
  FundingSources,
  JobNumberAutocomplete,
  Placeholder,
  ReadOnlyField,
} from "./ccFormFields";
import { clearDependentFields, resolveProductUnitIndex } from "./ccPendingSubmissions";
import { useCcJobNumberDetails, useCcMenus } from "./useCc";
import { useCcAttachment } from "./useCcMutations";
import { CC_SNACK } from "./ccCopy";
import {
  CC_MARKETING_CATEGORY,
  CC_TRAVEL_CATEGORY,
  ccTxnComplete,
  type CcAttachmentType,
  type CcTransaction,
} from "./ccTypes";

const COMMENT_MAX = 30;


/**
 * What the list needs from the panel before it lets the reader move on —
 * EditPane.tsx:425-435 exposes the same three through its own ref.
 */
export interface CcCategorisePanelHandle {
  hasUnsavedChanges: () => boolean;
  /** Persists now. Resolves false if the save failed, so the caller can stay put. */
  saveNow: () => Promise<boolean>;
  discard: () => void;
}

/**
 * Categorise one credit-card transaction, beside the list rather than over it.
 *
 * This is the source's EditPane: the right half of `/new-transactions`, live
 * against whichever row is highlighted on the left. The port had a modal
 * instead, which meant the reader could not see the list while deciding, and
 * every row cost an open/close round trip.
 *
 * Two things here are easy to mistake for accidents and are not:
 *
 *  - **Ticking any checkbox makes this read-only** (`editMode={!isBulkSelected}`,
 *    NewTransactionsDataGrid.tsx:484). Bulk selection and single editing are
 *    different modes in the source; editing one row while three are ticked for
 *    a bulk edit would leave the reader unsure which of the two writes wins.
 *  - **A travel row's units are not the reader's to pick.** They come from the
 *    job number (EditPane.tsx:577-590), so they are derived at render into
 *    `effective` rather than held in state — which also keeps the async job
 *    lookup out of an effect.
 */
export function CcCategorisePanel({
  txn,
  mode = "draft",
  editMode,
  enableEdit = false,
  ref,
  onDraftChange,
  onSave,
}: {
  /** Seeded once per row — the page keys this component by transaction id. */
  txn: CcTransaction;
  /**
   * Which screen this is serving — the source's `updateType` by another name,
   * and it drives the same three things (`EditPane.tsx:322-328`, `:441-445`,
   * `:1547-1604`).
   *
   * `draft` — Pending Submissions. Editable from the start, autosaved every
   * five seconds, written to `/save-draft`, incomplete rows welcome.
   *
   * `review` — Pending Approvals. The row is already submitted, so it opens
   * read-only and stays that way until the reader presses Edit; nothing is
   * autosaved, and a save has to leave the row complete because it is going
   * straight back to an approver.
   */
  mode?: "draft" | "review";
  /** `draft` only — the list drives this from its bulk selection. */
  editMode: boolean;
  /**
   * `review` only — whether Edit is offered at all. The source ties it to the
   * stage: a row still with the lead can be corrected, one finance already has
   * cannot (`PendingTransactionsDataGrid.tsx:232-237`).
   */
  enableEdit?: boolean;
  ref?: React.Ref<CcCategorisePanelHandle>;
  /** Fires on each field edit so the list's completeness tick keeps up. */
  onDraftChange: (next: CcTransaction) => void;
  /** Persists one row — `/save-draft` in draft mode, `/save-edit` in review. */
  onSave: (row: CcTransaction) => Promise<void>;
}) {
  const review = mode === "review";
  const menus = useCcMenus();
  const attachment = useCcAttachment();
  const getAccessToken = useAccessToken();
  const { showSuccess } = useNotifications();

  const [draft, setDraft] = useState<CcTransaction>(txn);
  // The last state known to be on the server. Seeded from the row this panel
  // was mounted for and advanced by every successful save, so "unsaved
  // changes" means what it says.
  const [baseline, setBaseline] = useState<CcTransaction>(txn);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [load, setLoad] = useState<(() => Promise<ReceiptSource>) | null>(null);
  // Which attachment the viewer is open on — needed alongside `load` so the
  // viewer's own Remove button (AttachmentButton.tsx:467-477) can be wired to
  // the right one.
  const [viewingType, setViewingType] = useState<CcAttachmentType | null>(null);
  const [fundingOpen, setFundingOpen] = useState(false);
  // `review` opens read-only whatever the caller says, and only the Edit button
  // moves it — `EditPane.tsx:322-328` ignores the `editMode` prop entirely once
  // the row has been submitted.
  const [isEditing, setIsEditing] = useState(false);
  /** Whether the fields accept input right now. */
  const editable = review ? isEditing : editMode;
  /** Show the fields as values rather than as controls. */
  const showValues = review && !isEditing;

  const categories = menus.expenseTypes.data?.categories ?? [];
  const subRegions = menus.subRegions.data?.subRegions ?? [];
  const jobNumbers = menus.jobNumbers.data?.jobNumbers ?? [];
  const productUnits = useMemo(() => menus.units.data?.productUnits ?? [], [menus.units.data]);
  const businessUnits = useMemo(() => menus.units.data?.businessUnits ?? [], [menus.units.data]);

  const category = draft.expenseCategoryLabel ?? "";
  const typeOptions = category ? menus.expenseTypes.data?.types[category] ?? [] : [];
  const isTravel = category === CC_TRAVEL_CATEGORY;
  // EditPane.tsx:1397 matches with startsWith, so a sub-category such as
  // "Marketing - Digital" still needs a sub-region.
  const isMarketing = category.startsWith(CC_MARKETING_CATEGORY);

  // EditPane.tsx:560-600 — the job number decides a travel transaction's units.
  const jobDetails = useCcJobNumberDetails(isTravel && draft.travelJobNumber ? draft.travelJobNumber : undefined);
  const jobUnits = isTravel ? jobDetails.data : undefined;
  const fundingSources = jobUnits?.fundingSources ?? [];
  // :568-575 — a job with no funding sources cannot be charged against, so the
  // source refuses to apply it rather than filling in half the row.
  const jobUnusable = Boolean(jobUnits) && fundingSources.length === 0;
  // :591-598 — a job can also come back without units. The source warns and
  // saves anyway: validateRequiredFields asks Travel only for a job number,
  // comment and expense type, never for the units.
  const jobMissingUnits = Boolean(jobUnits) && !(jobUnits?.productUnit && jobUnits?.businessUnit);
  const jobUsable = Boolean(jobUnits) && fundingSources.length > 0;

  /**
   * The row as it would be saved: the draft, plus the units a usable travel job
   * dictates. Derived rather than stored, so the job lookup resolving never has
   * to write state from an effect.
   */
  const effective: CcTransaction = useMemo(
    () =>
      isTravel && jobUsable && jobUnits
        ? { ...draft, productUnit: jobUnits.productUnit, businessUnit: jobUnits.businessUnit }
        : draft,
    [draft, isTravel, jobUsable, jobUnits],
  );

  const signature = (t: CcTransaction) =>
    JSON.stringify([
      t.expenseCategoryLabel,
      t.expenseTypeLabel,
      t.txnComment,
      t.travelJobNumber,
      t.subRegion,
      t.productUnit,
      t.businessUnit,
    ]);
  const dirty = signature(effective) !== signature(baseline);

  // The autosave thunk, held through a ref the render keeps current — see the
  // hook call below for why it is indirected rather than passed inline.
  const autosave = useRef<() => Promise<void>>(async () => {});

  // The signature as of the latest render, for `persist` to compare against
  // when it finishes — its own `row` argument is whatever was current when the
  // write STARTED, which may be several edits ago by the time it lands.
  const latestSignature = useRef(signature(txn));
  latestSignature.current = signature(effective);

  const persist = async (row: CcTransaction): Promise<boolean> => {
    // :568-575 — a job with no funding sources cannot be charged against, so it
    // is never written. `CcEditDialog` refuses the same case; without this the
    // autosave, the Save button and `saveNow` would all persist a travel row
    // against a job finance cannot book it to.
    //
    // Only `jobUnusable`, never `!jobUsable`: a lookup that has not resolved,
    // or failed, must still let a part-finished draft be saved.
    if (isTravel && jobUnusable) {
      setSaveError("No funding sources found for the selected Job number.");
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(row);
      setBaseline(row);
      // Disarm any queued autosave for what was just written. Setting the
      // baseline is not enough on its own: the list re-keys this panel the
      // moment the reader moves on, and that unmount is batched into the same
      // commit — so there is no render in between for the thunk below to
      // notice the row is clean, and the hook would flush a duplicate POST.
      //
      // Only when nothing has changed since this write began. A save can still
      // be in flight while the reader carries on typing, and disarming then
      // would drop THEIR edit: the queued thunk would resolve without writing
      // and the hook would record the newer signature as saved.
      if (latestSignature.current === signature(row)) {
        autosave.current = async () => {};
      }
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Save, and in review mode drop back to read-only once it lands (`:395-397`). */
  const saveRow = async (): Promise<boolean> => {
    // The rule lives on the save path, not just on the Save button. The button
    // is disabled for an incomplete row, but `saveNow()` is also reached from
    // the unsaved-changes dialog's "Save & Continue" — so a reader could clear
    // a required field, click another row and push an incomplete correction
    // back to an approver without ever touching a Save button.
    //
    // Review only: a draft is allowed to be half-finished, which is the point
    // of a draft.
    if (review && !ccTxnComplete(effective)) {
      setSaveError("Please fill in all required fields.");
      return false;
    }
    const ok = await persist(effective);
    if (ok && review) setIsEditing(false);
    return ok;
  };

  // EditPane.tsx:442-473 — five seconds after the last change, the source's own
  // autoSaveDelay (:150). Kept as the safety net behind the explicit Save:
  // categorising a batch and closing the tab must not throw the work away.
  //
  // Paused while a bulk selection is active, because the panel is read-only
  // then and the rows being edited are the modal's, not this one's.
  //
  // Handed to the hook as a one-line wrapper around the ref above rather than
  // as the closure itself. The hook snapshots the thunk when it arms the timer
  // and replays that snapshot if this unmounts with a save still queued, so an
  // inline closure would be replayed stale — posting the transaction a second
  // time after the reader had already been told it was saved. The wrapper
  // defers to whatever the latest render, or `persist`, last decided.
  autosave.current = async () => {
    if (!dirty) return;
    // Rethrow a failed write. `persist` resolves false rather than throwing so
    // the Save button can stay put on the row, but swallowing that here let the
    // hook record the signature as saved: the chip read "Draft saved" next to
    // the error alert, and nothing retried.
    if (!(await persist(effective))) {
      throw new Error("Could not save the draft");
    }
  };
  // `ready` is false for the whole of review mode, which is what keeps the hook
  // from ever arming — the source guards the same way (`:441-445`), because a
  // correction to a submitted row goes back to an approver and must not leave
  // on a timer the reader did not ask for.
  const draftState = useDraftAutosave(
    signature(effective),
    !review && editMode,
    () => autosave.current(),
    5000,
  );

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => dirty,
    saveNow: () => saveRow(),
    discard: () => {
      // Same reason as in `persist`: the reader has said to throw this away and
      // this panel unmounts in the same commit, so the queued autosave has to
      // be cancelled here or it will write back the edit that was discarded.
      autosave.current = async () => {};
      setDraft(baseline);
      onDraftChange(baseline);
      setIsEditing(false);
      // The row being restored is the one that was last saved, so a failure
      // report about the edit just thrown away no longer describes anything on
      // screen.
      setSaveError(null);
    },
  }));

  /** Apply one field, clearing whatever it invalidates beneath it. */
  const change = (patch: Partial<CcTransaction>, cleared?: Partial<CcTransaction>) => {
    const next = { ...draft, ...cleared, ...patch };
    setDraft(next);
    onDraftChange(next);
  };

  const unitIndex = resolveProductUnitIndex(
    draft.productUnit,
    draft.businessUnit,
    productUnits,
    businessUnits,
  );
  const unitOptions = useMemo(
    () => productUnits.map((pu, i) => ({ i, label: `${pu} — ${businessUnits[i] ?? ""}` })),
    [productUnits, businessUnits],
  );

  const viewAttachment = (attachmentType: CcAttachmentType) => {
    setViewingType(attachmentType);
    // A loader, not a loaded source: ReceiptViewer fetches when it opens.
    // fetchBase64Attachment, not fetchReceiptObjectUrl — this endpoint returns
    // base64, not bytes.
    setLoad(() => async () =>
      fetchBase64Attachment(ccServiceUrls.attachment(txn.id, attachmentType), await getAccessToken()),
    );
  };

  return (
    // A full-height column with the action row pushed to the bottom — the
    // source's own pane (`height: 100%` with `justifyContent: space-between`,
    // EditPane.tsx:770-787). Without it Save floated directly under whichever
    // field happened to be last, which moved as the category changed the form.
    // `flex: 1` with no `minHeight: 0`: grow to fill the card when there is
    // room to spare, so the action row's `mt: auto` can hold Save at the
    // bottom — but never shrink below the form's own height, so a short window
    // scrolls the card rather than compressing the fields out of sight.
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* EditPane.tsx:790-851 — id, description and amount, with the full
          description available on hover when it is too long to show. */}
      <Box sx={{ bgcolor: "action.hover", borderRadius: 1.5, p: 1.5 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          {/* A proper Tooltip, not the native `title` attribute — the
              browser's own tooltip is slow to appear and styled outside the
              app entirely. */}
          <Tooltip describeChild title={draft.txnDescription ?? ""} arrow>
            <Typography
              sx={{ fontSize: 15, fontWeight: 700, flex: 1, lineHeight: 1.35 }}
            >
              {txn.id} - {draft.txnDescription}
            </Typography>
          </Tooltip>
          <Typography sx={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            ${bareAmount(draft.txnAmount)}
          </Typography>
        </Stack>
        {/* :909-936 — the lead rides inline only while the row is still a draft;
            once it has been submitted that same slot becomes the submission
            trail, because by then there is more to say than one name.

            The autosave chip lives on this same line, not a line of its own —
            this row already reserves the right-hand slot via
            `justifyContent="space-between"`, so the chip appearing or
            disappearing as the draft state changes never adds or removes a
            row, and the gap under the title stays fixed. */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
            Date: {formatNice(draft.txnDate)}
            {!review && draft.leadEmail && ` | Lead Approver: ${draft.leadEmail.split(",")[0]}`}
          </Typography>
          {!review && <DraftStatusChip state={draftState} />}
        </Stack>
        {review && <CcSubmissionDetails txn={txn} />}
      </Box>

      {/* No banner when a bulk selection makes this read-only. The source shows
          none — the fields going flat says it — and one here changed the
          panel's height the moment a row was ticked, which shifted every field
          under it and pushed the attachments off the bottom of the screen. */}

      {menus.expenseTypes.isError && (
        <Alert severity="error" sx={{ mt: 2, fontSize: 12.5 }}>
          Couldn't load the expense categories.
        </Alert>
      )}

      {/* Tight on purpose: this panel may not scroll, so it has to fit the
          window at laptop heights with the attachments and Save still in it.
          `flex: 1` gives the column the panel's full remaining height, which is
          what lets the action row at the end of it sit against the bottom. */}
      <Stack spacing={1.5} sx={{ mt: 1.5, flex: 1 }}>
        {showValues ? (
          // A submitted row, not being corrected. The source draws these as
          // text in dashed boxes rather than as disabled controls
          // (`EditPane.tsx:1126-1425`) — a screenful of greyed-out dropdowns
          // reads as "broken" where this reads as "settled".
          <>
            <FieldRow>
              <ReadOnlyField label="Expense Category" value={draft.expenseCategoryLabel} fallback="(not entered)" />
              <ReadOnlyField label="Expense Type" value={draft.expenseTypeLabel} fallback="(not entered)" />
            </FieldRow>
            <ReadOnlyField label="Comment" value={draft.txnComment} fallback="(empty)" />
            <FieldRow>
              {isTravel ? (
                <ReadOnlyField label="Job Number" value={draft.travelJobNumber} fallback="(not entered)" />
              ) : (
                <>
                  <ReadOnlyField label="Product Unit" value={draft.productUnit} fallback="(not provided)" />
                  <ReadOnlyField label="Business Unit" value={draft.businessUnit} fallback="(not provided)" />
                </>
              )}
              {isMarketing && (
                <ReadOnlyField label="Sub Region" value={draft.subRegion} fallback="(not entered)" />
              )}
            </FieldRow>
            <FieldRow>
              {/* `viewOnly`, not `disabled` — AttachmentButton.tsx:406,467 keeps
                  an attached file openable on a submitted row but offers no way
                  to replace or remove it until the row is being corrected. */}
              <AttachmentField
                label="Receipt"
                fileName={draft.receiptFileName}
                viewOnly
                onView={() => viewAttachment("receipt")}
                onPick={async () => {}}
              />
              <AttachmentField
                label="Contract"
                fileName={draft.contractFileName}
                viewOnly
                onView={() => viewAttachment("contract")}
                onPick={async () => {}}
              />
            </FieldRow>
          </>
        ) : (
          <>
        <FieldRow>
          <Field label="Expense Category" required>
            <Select
              value={category}
              disabled={!editable}
              onChange={(e) =>
                change(
                  { expenseCategoryLabel: String(e.target.value) || null },
                  clearDependentFields("expenseCategory"),
                )
              }
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
          <Field label="Expense Type" required>
            <Select
              value={draft.expenseTypeLabel ?? ""}
              disabled={!editable || !category}
              onChange={(e) =>
                change(
                  { expenseTypeLabel: String(e.target.value) || null },
                  clearDependentFields("expenseType"),
                )
              }
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
        </FieldRow>

        <Box>
          {/* The counter rides on the label rather than under the field as
              helper text. As helper text it cost a whole line of the panel,
              which on a screen that may not scroll is a line the fields need
              more than the counter does. */}
          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <FieldLabel>
              Comment
              <Box component="span" sx={{ color: "error.main", ml: 0.25 }}>*</Box>
            </FieldLabel>
            <FieldLabel>
              {(draft.txnComment ?? "").length}/{COMMENT_MAX}
            </FieldLabel>
          </Stack>
          <TextField
            size="small"
            fullWidth
            disabled={!editable}
            value={draft.txnComment ?? ""}
            onChange={(e) => change({ txnComment: e.target.value.slice(0, COMMENT_MAX) || null })}
            placeholder="Short note for this transaction"
            // The caption above is a plain Typography, so name the input.
            inputProps={{ "aria-label": "Comment", maxLength: COMMENT_MAX }}
          />
        </Box>

        {isTravel ? (
          <Field label="Travel Job Number" required>
            <JobNumberAutocomplete
              value={draft.travelJobNumber}
              options={jobNumbers}
              disabled={!editable}
              onChange={(v) => change({ travelJobNumber: v }, clearDependentFields("travelJobNumber"))}
            />
            {/* :568-598 warns on both, because either one leaves the row short
                of what finance needs and neither is the reader's fault. */}
            {jobDetails.isError && (
              <Alert severity="error" sx={{ mt: 1, fontSize: 12.5 }}>
                An error occurred while fetching job number details.
              </Alert>
            )}
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
                  Units from this job: {jobUnits.productUnit} · {jobUnits.businessUnit}
                </Typography>
                {/* :1288-1318 — behind a button, as the source has it, not
                    spread out in the form. Six columns of funding split is
                    reference material a reader opens once to check; inline it
                    was the one thing tall enough to push this panel past the
                    window, which on a screen that does not scroll means it
                    would simply have been cut off. */}
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setFundingOpen(true)}
                  sx={{ textTransform: "none", fontWeight: 600, mt: 0.25, px: 0 }}
                >
                  View funding sources ({fundingSources.length})
                </Button>
              </Box>
            )}
          </Field>
        ) : (
          // Sub Region sits in this row rather than on one of its own: the row
          // fits three across when there is width for it, and Marketing is the
          // tallest form on a screen that may not scroll, so the line that
          // saves is the difference between fitting a laptop window and not.
          //
          // Sub Region can only ever appear here — a category is one value, so
          // it is either Travel or Marketing, never both.
          <FieldRow>
            <Field label="Product Unit" required>
              <Select<number | "">
                value={unitIndex ?? ""}
                disabled={!editable}
                onChange={(e) => {
                  const i = e.target.value === "" ? null : Number(e.target.value);
                  change({
                    productUnit: i === null ? null : productUnits[i] ?? null,
                    businessUnit: i === null ? null : businessUnits[i] ?? null,
                  });
                }}
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
            {/* :1366-1393 — read-only. The business unit follows the product
                unit; it is shown so the reader can see what they picked implies. */}
            <Field label="Business Unit">
              <TextField
                size="small"
                fullWidth
                value={draft.businessUnit ?? ""}
                placeholder="From the product unit"
                InputProps={{ readOnly: true }}
                inputProps={{ "aria-label": "Business Unit" }}
              />
            </Field>
            {isMarketing && (
              <Field label="Sub Region" required>
                <Select
                  value={draft.subRegion ?? ""}
                  disabled={!editable}
                  onChange={(e) => change({ subRegion: String(e.target.value) || null })}
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
          </FieldRow>
        )}

        <FieldRow>
          <AttachmentField
            label="Receipt"
            fileName={draft.receiptFileName}
            disabled={!editable}
            onView={() => viewAttachment("receipt")}
            onPick={async (file) => {
              const name = await attachment.upload.mutateAsync({ id: txn.id, attachmentType: "receipt", file });

              // The server already has this file: written to baseline too, not
              // just draft, so Discard afterwards can't revert past it.
              const patch = { receiptFileName: name || file.name };
              change(patch);
              setBaseline((b) => ({ ...b, ...patch }));
            }}
          />
          <AttachmentField
            label="Contract"
            fileName={draft.contractFileName}
            disabled={!editable}
            onView={() => viewAttachment("contract")}
            onPick={async (file) => {
              const name = await attachment.upload.mutateAsync({ id: txn.id, attachmentType: "contract", file });
              // The server already has this file: written to baseline too, not
              // just draft, so Discard afterwards can't revert past it.
              const patch = { contractFileName: name || file.name };
              change(patch);
              setBaseline((b) => ({ ...b, ...patch }));
            }}
          />
        </FieldRow>
          </>
        )}

        {saveError && (
          <Alert severity="error" sx={{ fontSize: 12.5 }}>
            Couldn't save this transaction. {saveError}
          </Alert>
        )}

        {/* EditPane.tsx:1522-1605 — Save held against the bottom of the panel
            by `mt: auto`. The autosave status used to sit here too; it now
            rides with the amount at the top instead, since that is the row
            it is actually reporting on. */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="flex-end"
          spacing={1.5}
          sx={{ mt: "auto", pt: 1.5 }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            {/* :1547-1585 — Edit only while clean, because once there are edits
                the way out is Discard or Save, not a toggle that would leave it
                ambiguous which of the two the reader meant. */}
            {review && enableEdit && !dirty && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => setIsEditing((v) => !v)}
                sx={{ fontWeight: 600, minWidth: 90 }}
              >
                {isEditing ? "Cancel" : "Edit"}
              </Button>
            )}
            {review && isEditing && dirty && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={saving || jobDetails.isFetching}
                onClick={() => {
                  setDraft(baseline);
                  onDraftChange(baseline);
                  setIsEditing(false);
                  setSaveError(null);
                }}
                sx={{ fontWeight: 600, minWidth: 90 }}
              >
                Discard
              </Button>
            )}
            {editable && (
              // :1595-1599 — nothing to save, or a save already in flight. A job
              // with no funding sources is refused by `persist`, so say so here
              // rather than letting the press fail silently. In review the row
              // is going back to an approver, so it also has to be complete —
              // the source validates on save (:338-380); disabling says the same
              // thing without the round trip, which is what `CcEditDialog`
              // already does.
              <Tooltip title={review && dirty && !ccTxnComplete(effective) ? "Please fill in all required fields." : ""}>
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={
                      !dirty ||
                      saving ||
                      jobDetails.isFetching ||
                      (isTravel && jobUnusable) ||
                      (review && !ccTxnComplete(effective))
                    }
                    onClick={() => void saveRow()}
                    sx={{ fontWeight: 600, minWidth: 90 }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </span>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </Stack>

      <Dialog open={fundingOpen} onClose={() => setFundingOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>
          Funding Sources
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", fontWeight: 400 }}>
            What this transaction costs each share of the job.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <FundingSources sources={fundingSources} totalAmount={draft.txnAmount} />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setFundingOpen(false)}>
            Close
          </Button>
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
        // on the form, and only when the row is actually open for correction.
        onRemove={
          editable && viewingType
            ? async () => {
                await attachment.remove.mutateAsync({ id: txn.id, attachmentType: viewingType });
                // The server has already dropped this file: written to baseline
                // too, not just draft, so Discard afterwards can't bring it back.
                const patch = viewingType === "receipt" ? { receiptFileName: null } : { contractFileName: null };
                change(patch);
                setBaseline((b) => ({ ...b, ...patch }));
                showSuccess(CC_SNACK.success.removeAttachment);
              }
            : undefined
        }
      />
    </Box>
  );
}
