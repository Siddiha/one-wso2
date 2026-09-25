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

import { useState } from "react";
import { Box, Button, Collapse, IconButton, Stack, Tooltip, Typography } from "@wso2/oxygen-ui";
import { ChevronDownIcon, CirclePlusIcon, FileIcon } from "@wso2/oxygen-ui-icons-react";
import { useAccessToken } from "@hooks/useAccessToken";
import { ccServiceUrls } from "@config/apiConfig";
import { ReceiptViewer } from "../components/ReceiptViewer";
import { fetchBase64Attachment, type ReceiptSource } from "../util/financeReceipts";
import { bareAmount, formatNice } from "../util/financeFormat";
import { CC_TRAVEL_CATEGORY, CC_MARKETING_CATEGORY, type CcAttachmentType, type CcTransaction } from "./ccTypes";

/**
 * The transaction an approver is looking at, beside the queue rather than over
 * it — the right half of the source's `/approve-submissions` (its `EditPane`
 * with `editMode` forced off, `EditPane.tsx:322-328`).
 *
 * Read-only by design. Everything here is drawn as a value in a dashed box
 * rather than as a disabled control, which is what the source does
 * (`EditPane.tsx:1126-1425`): a screenful of greyed-out dropdowns reads as
 * "broken" where this reads as "settled". Changing anything goes through Edit,
 * and only finance is offered it.
 */
export function CcApproveDetail({
  txn,
  canEdit,
  onEdit,
}: {
  txn: CcTransaction;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const getAccessToken = useAccessToken();
  const [load, setLoad] = useState<(() => Promise<ReceiptSource>) | null>(null);

  const isTravel = txn.expenseCategoryLabel === CC_TRAVEL_CATEGORY;
  // EditPane.tsx:1397 matches with startsWith, so "Marketing - Digital" counts.
  const isMarketing = (txn.expenseCategoryLabel ?? "").startsWith(CC_MARKETING_CATEGORY);

  const view = (attachmentType: CcAttachmentType) =>
    // fetchBase64Attachment, not fetchReceiptObjectUrl — this endpoint returns
    // base64 rather than bytes.
    setLoad(() => async () =>
      fetchBase64Attachment(ccServiceUrls.attachment(txn.id, attachmentType), await getAccessToken()),
    );

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* :790-851 — id, description and amount, with the full description on
          hover when it is too long to show. */}
      <Box sx={{ bgcolor: "action.hover", borderRadius: 1.5, p: 1.5 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          {/* A proper Tooltip, not the native `title` attribute — the
              browser's own tooltip is slow to appear and styled outside the
              app entirely. */}
          <Tooltip describeChild title={txn.txnDescription ?? ""} arrow>
            <Typography sx={{ fontSize: 15, fontWeight: 700, flex: 1, lineHeight: 1.35 }}>
              {txn.id} - {txn.txnDescription}
            </Typography>
          </Tooltip>
          <Typography sx={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            ${bareAmount(txn.txnAmount)}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Date: {formatNice(txn.txnDate)}</Typography>
        </Stack>
        <SubmissionDetails txn={txn} />
      </Box>

      <Stack spacing={1.5} sx={{ mt: 1.5, flex: 1 }}>
        <Row>
          <Value label="Expense Category" value={txn.expenseCategoryLabel} fallback="(not entered)" />
          <Value label="Expense Type" value={txn.expenseTypeLabel} fallback="(not entered)" />
        </Row>
        <Value label="Comment" value={txn.txnComment} fallback="(empty)" />
        <Row>
          {isTravel ? (
            <Value label="Job Number" value={txn.travelJobNumber} fallback="(not entered)" />
          ) : (
            <>
              <Value label="Product Unit" value={txn.productUnit} fallback="(not provided)" />
              <Value label="Business Unit" value={txn.businessUnit} fallback="(not provided)" />
            </>
          )}
          {isMarketing && <Value label="Sub Region" value={txn.subRegion} fallback="(not entered)" />}
        </Row>
        <Row>
          <Attachment label="Receipt" fileName={txn.receiptFileName} onView={() => view("receipt")} />
          <Attachment label="Contract" fileName={txn.contractFileName} onView={() => view("contract")} />
        </Row>

        {/* :1548-1562 — Edit sits at the bottom of the pane, and only finance is
            offered it. `mt: auto` is what holds it there. */}
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: "auto", pt: 1.5 }}>
          {canEdit && (
            <Button variant="outlined" size="small" onClick={onEdit} sx={{ fontWeight: 600, minWidth: 90 }}>
              Edit
            </Button>
          )}
        </Stack>
      </Stack>

      <ReceiptViewer title="Attachment" load={load} onClose={() => setLoad(null)} />
    </Box>
  );
}

/** Fields lay themselves out from the width they have, not from breakpoints. */
function Row({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 1.5 }}>
      {children}
    </Box>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.disabled", fontWeight: 600, mb: 0.5 }}
    >
      {children}
    </Typography>
  );
}

/**
 * One read-only field. The fallbacks differ by field because the source's do:
 * "(not entered)" for something nobody filled in, "(not provided)" for
 * something the system should have supplied, "(empty)" for a blank comment.
 */
function Value({ label, value, fallback }: { label: string; value: string | null; fallback: string }) {
  return (
    <Box sx={{ border: "1.5px dashed", borderColor: "divider", borderRadius: 1.5, px: 1.5, py: 1, minWidth: 0 }}>
      <Caption>{label}</Caption>
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
 * An attachment an approver may open but not change — `AttachmentButton.tsx:341-
 * 348` keeps the file viewable while the row is not theirs to edit and offers
 * no upload or remove. Same file-icon-vs-add-icon switch the editable
 * AttachmentField uses (`AttachmentButton.tsx:406-414` does the same in
 * disableEdit mode too) so an empty slot reads as empty rather than looking
 * like a dimmed copy of an attached one — inside this panel's own dashed
 * field style, which every sibling value here (`Value`, above) already uses.
 */
function Attachment({ label, fileName, onView }: { label: string; fileName: string | null; onView: () => void }) {
  const has = Boolean(fileName);
  return (
    <Box sx={{ border: "1.5px dashed", borderColor: "divider", borderRadius: 1.5, px: 1.5, py: 0.5, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Caption>{label}</Caption>
        {/* Nothing to describe when there's nothing attached — no tooltip
            until `has`. */}
        <Tooltip
          describeChild
          title={has ? `View ${label}` : `No attach ${label}`}
          arrow
          disableHoverListener={!has}
          disableFocusListener={!has}
          disableTouchListener={!has}
          slotProps={{ tooltip: { sx: { fontSize: 10.5, px: 1, py: 0.5 } } }}
        >
          <span>
            <IconButton size="small" aria-label={`View ${label}`} onClick={onView} disabled={!has}>
              {has ? <FileIcon size={16} /> : <CirclePlusIcon size={16} />}
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
}

/**
 * Who has had the submission and when — the source's "Submission details"
 * accordion (`EditPane.tsx:853-1101`), collapsed by default (`:674`) because an
 * approver opens this screen to decide, not to audit.
 *
 * `unmountOnExit` so a collapsed trail is genuinely absent: at zero height a
 * screen reader would still read out six fields nobody can see.
 */
function SubmissionDetails({ txn }: { txn: CcTransaction }) {
  const [open, setOpen] = useState(false);
  const date = (iso: string | null) => (iso ? formatNice(iso) : null);
  const cells = [
    { label: "Submitted User", value: txn.employeeEmail, fallback: "(not provided)" },
    // One lead, not the whole assigned list — `leadEmail` can name several.
    { label: "Lead Approver", value: txn.leadEmail?.split(",")[0]?.trim() ?? null, fallback: "(not assigned yet)" },
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
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 1.25, mt: 1 }}>
          {cells.map((c) => (
            <Box key={c.label} sx={{ minWidth: 0 }}>
              <Caption>{c.label}</Caption>
              <Typography sx={{ fontSize: 12, color: c.value ? "text.primary" : "text.disabled" }} noWrap title={c.value ?? undefined}>
                {c.value || c.fallback}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
