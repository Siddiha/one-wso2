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
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from "@wso2/oxygen-ui";
import { PencilIcon, XIcon } from "@wso2/oxygen-ui-icons-react";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { isExpenseBackendConfigured } from "@config/apiConfig";
import FinanceShell from "../../components/FinanceShell";
import { DraftStatusChip } from "../../components/DraftStatusChip";
import { describeError } from "../../util/financeError";
import { money, formatNice } from "../../util/financeFormat";
import { useDraftAutosave } from "../../util/useDraftAutosave";
import { useExpenseAppData, useExpenseEmployees } from "../useExpense";
import { AddExpenseDialog, FieldLabel, type DraftLine } from "../ExpenseLineDialog";
import { useExpenseDraftSync, useExpenseReceiptUpload, useSubmitExpenseClaim } from "../useExpenseMutations";
import type { ExpenseTransactionPayload } from "../expenseTypes";
import { FINANCE_EYEBROW } from "@constants/financeApps";
import { useNavigate } from "react-router";
import { claimTabPath } from "../../claims/claimsTabs";


export default function ExpenseNewClaimPage() {
  return (
    <FinanceShell
      eyebrow={FINANCE_EYEBROW.claims}
      title="New expense claim"
      subtitle="Add each out-of-pocket expense as a line — date, amount and currency, expense type and its receipt — then submit the claim to your lead. Amounts are converted to your reimbursement currency automatically."
      configured={isExpenseBackendConfigured()}
      configKey="ONE_WSO2_EXPENSE_CLAIMS_BACKEND_URL"
    >
      <NewClaimBody />
    </FinanceShell>
  );
}


function NewClaimBody() {
  const appData = useExpenseAppData();
  const upload = useExpenseReceiptUpload();
  const submit = useSubmitExpenseClaim();
  const draft = useExpenseDraftSync();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotifications();

  const [items, setItems] = useState<DraftLine[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  // ClaimItemCard gets AccessMode.EDIT_DELETE (NewClaim.tsx:139) — a line can
  // be corrected in place, not just removed and retyped.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [confirmingDraftLoss, setConfirmingDraftLoss] = useState(false);

  const email = appData.data?.userInfo.workEmail ?? "";
  const employees = useExpenseEmployees();
  const leadEmail = appData.data?.userInfo.managerEmail ?? null;
  // AppHandler.tsx:28 resolves the lead's name from /employees and falls back
  // to the address; NewClaim.tsx:240-242 omits the parenthetical when neither
  // is known, rather than printing an empty one.
  const leadLabel = useMemo(() => {
    if (!leadEmail) return null;
    const match = (employees.data ?? []).find((e) => e.workEmail === leadEmail);
    const name = match && [match.firstName, match.lastName].filter(Boolean).join(" ").trim();
    return name || leadEmail;
  }, [employees.data, leadEmail]);
  const reimbursementCurrency = appData.data?.currencyCode ?? "LKR";
  const total = useMemo(() => items.reduce((s, it) => s + it.reimbursementAmount, 0), [items]);

  // Trim a form line down to the wire payload (drops derived fields).
  const toPayload = (line: DraftLine): ExpenseTransactionPayload => ({
    date: line.date,
    amount: line.amount,
    currency: line.currency,
    expenseTypeId: line.expenseTypeId,
    comment: line.comment,
    receiptUrl: line.receiptUrl,
    travelJobNumber: line.travelJobNumber ?? null,
  });

  // NewClaim.tsx:200-216 puts the saved draft behind an explicit "Restore
  // Draft" choice beside "Create Claim". Restoring it silently makes a stale
  // draft look like work in progress, and leaves no way to start fresh without
  // first deleting lines you never entered this session.
  const savedDraft = useMemo(() => {
    const drafted = appData.data?.draft?.transactions ?? [];
    return (
      // We send drafts as the trimmed payload (no derived fields), so don't
      // assume the echoed draft carries reimbursementAmount / currency /
      // expenseType — recompute them if absent, or the restored total is
      // NaN and renders as "Rs. 0.00".
      drafted.map((t) => {
          const rate = Number.isFinite(t.currencyConversionRate) ? t.currencyConversionRate : 1;
          const reimbursementAmount = Number.isFinite(t.reimbursementAmount)
            ? t.reimbursementAmount
            : Math.round(t.amount * rate * 100) / 100;
          return {
            date: t.date,
            amount: t.amount,
            currency: t.currency,
            expenseTypeId: t.expenseTypeId,
            comment: t.comment ?? null,
            receiptUrl: t.receiptUrl ?? null,
            travelJobNumber: t.travelJobNumber ?? null,
            reimbursementAmount,
            reimbursementCurrency: t.reimbursementCurrency ?? reimbursementCurrency,
            expenseType: t.expenseType ?? "",
          };
      })
    );
  }, [appData.data, reimbursementCurrency]);

  /**
   * `/app-data` says WHO a saved draft was being filed for — the backend's
   * `ExpenseClaimDraft.onBehalfOfEmail` (`types.bal:26-31`). The shared
   * `ExpenseAppData` does not name the field (`expenseSubmitterTypes.ts`
   * describes the fuller shape), so it is read narrowly here rather than by
   * widening a type the approvals screens also depend on.
   */
  const savedDraftOnBehalfOf =
    (appData.data?.draft as { onBehalfOfEmail?: string | null } | null | undefined)?.onBehalfOfEmail ??
    null;
  // There is ONE draft slot per person, shared with the submitter screen.
  const draftExists = savedDraft.length > 0;
  // NewClaim.tsx:53 — `canRestoreDraft` requires the draft to have been filed
  // for whoever the form is filing for now. This form is always the reader's
  // own claim, so a draft saved while filing FOR somebody else is not theirs
  // to restore: its lines carry that employee's job numbers and expense types,
  // and submitting them here would file that person's spend as the reader's.
  const draftOffered = items.length === 0 && draftExists && savedDraftOnBehalfOf === null;

  const draftState = useDraftAutosave(JSON.stringify(items), appData.isSuccess, async () => {
    if (items.length > 0) await draft.save.mutateAsync(items.map(toPayload));
    else await draft.remove.mutateAsync();
  });

  if (appData.isLoading) {
    return (
      <Stack spacing={1.75} sx={{ maxWidth: 880 }}>
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1.5 }} />
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1.5 }} />
      </Stack>
    );
  }
  if (appData.isError) {
    return <Alert severity="error">Couldn't load your expense profile. {describeError(appData.error)}</Alert>;
  }

  // NewClaim.tsx:64-69. No year checks here — unlike OPD an expense claim is
  // not filed against a single year's balance.
  const handleRestoreDraft = () => {
    setItems(savedDraft);
    showSuccess("Draft restored successfully");
  };

  const handleSubmit = () => {
    if (items.length === 0) return;
    setConfirmingSubmit(false);
    submit.mutate(
      { transactions: items.map(toPayload) },
      {
        onSuccess: () => {
          showSuccess("Expense claim submitted to your lead");
          // Delete the draft synchronously (see OPD note) so a fast unmount
          // can't leave it to be re-seeded and submitted as a duplicate.
          draft.remove.mutate();
          setItems([]);
          // Back to the list the claim just joined, so the submission has a
          // visible result rather than leaving an emptied form on screen.
          //
          // `replace`, so Back does not return to a form that has already been
          // sent — it goes wherever the user was before they opened it.
          navigate(claimTabPath("expense"), { replace: true });
        },
        onError: (err) => showError(describeError(err)),
      },
    );
  };

  return (
    <Stack spacing={1.75} sx={{ maxWidth: 880 }}>
      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <FieldLabel>Expenses in this claim</FieldLabel>
          <DraftStatusChip state={draftState} />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              // :187-193 — starting a new line discards the saved draft,
              // whoever it was being filed for: there is one slot per person.
              if (items.length === 0 && draftExists) {
                setConfirmingDraftLoss(true);
                return;
              }
              setDialogOpen(true);
            }}
            sx={{ fontWeight: 600, textTransform: "none" }}
          >
            + Add expense
          </Button>
        </Stack>

        {items.length === 0 ? (
          <Stack alignItems="center" spacing={1.25} sx={{ py: 2 }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              No expenses yet. Add your first line to start the claim.
            </Typography>
            {draftOffered && (
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
                  You have a saved draft.
                </Typography>
                <Button
                  size="small"
                  color="success"
                  variant="outlined"
                  onClick={handleRestoreDraft}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  Restore Draft
                </Button>
              </Stack>
            )}
          </Stack>
        ) : (
          <Stack spacing={1}>
            {items.map((it, i) => (
              <Box
                key={i}
                sx={{ display: "flex", alignItems: "center", gap: 1.5, border: 1, borderColor: "divider", borderRadius: 1, px: 1.5, py: 1 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap>
                    {it.expenseType}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: "text.secondary" }} noWrap>
                    {formatNice(it.date)}
                    {it.travelJobNumber ? ` · ${it.travelJobNumber}` : ""}
                    {it.receiptUrl ? " · receipt attached" : ""}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {money(it.reimbursementAmount, it.reimbursementCurrency)}
                  </Typography>
                  {it.currency !== it.reimbursementCurrency && (
                    <Typography sx={{ fontSize: 11, color: "text.disabled" }}>{money(it.amount, it.currency)}</Typography>
                  )}
                </Box>
                <IconButton
                  size="small"
                  aria-label="Edit expense"
                  onClick={() => {
                    setEditingIndex(i);
                    setDialogOpen(true);
                  }}
                  sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}
                >
                  <PencilIcon size={14} />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Remove expense"
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
                >
                  <XIcon size={15} />
                </IconButton>
              </Box>
            ))}
          </Stack>
        )}
      </Card>

      {submit.isError && <Alert severity="error">{describeError(submit.error)}</Alert>}

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => setConfirmingSubmit(true)} disabled={items.length === 0 || submit.isPending} sx={{ fontWeight: 600 }}>
          {submit.isPending ? "Submitting…" : `Submit claim (${money(total, reimbursementCurrency)})`}
        </Button>
      </Box>

      {/* NewClaim.tsx:225-248 — a claim leaves for review, so it is confirmed
          rather than sent on one click, and the message says who gets it. */}
      <Dialog open={confirmingSubmit} onClose={() => setConfirmingSubmit(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>Claim Submission Confirmation</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: 13.5 }}>
            Are you sure you want to submit this claim? Once submitted, it will be sent to your lead
            {leadLabel && <b>{` (${leadLabel})`}</b>} for review.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setConfirmingSubmit(false)}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={handleSubmit} disabled={submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* :263-270 — the saved draft goes the moment a new line is added. */}
      <Dialog open={confirmingDraftLoss} onClose={() => setConfirmingDraftLoss(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>Draft Deletion Warning</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: 13.5 }}>
            Adding a new claim will delete your draft. Are you sure you want to proceed?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setConfirmingDraftLoss(false)}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              setConfirmingDraftLoss(false);
              setDialogOpen(true);
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {dialogOpen && appData.data && (
        <AddExpenseDialog
          appData={appData.data}
          editing={editingIndex != null ? items[editingIndex] : undefined}
          uploading={upload.isPending}
          onUpload={(file) => upload.mutateAsync({ email, file })}
          onClose={() => {
            setDialogOpen(false);
            setEditingIndex(null);
          }}
          onAdd={(line) => {
            setItems((prev) =>
              editingIndex != null
                ? prev.map((it, j) => (j === editingIndex ? line : it))
                : [...prev, line],
            );
            setDialogOpen(false);
            setEditingIndex(null);
          }}
        />
      )}
    </Stack>
  );
}
