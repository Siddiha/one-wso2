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

import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  DataGrid,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@wso2/oxygen-ui";
import { CheckCircleIcon } from "@wso2/oxygen-ui-icons-react";
import { FINANCE_GRID_SX } from "../../util/financeGridSx";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { isCcBackendConfigured } from "@config/apiConfig";
import FinanceShell from "../../components/FinanceShell";
import { describeError } from "../../util/financeError";
import { bareAmount, formatNice } from "../../util/financeFormat";
import { CardMenu } from "../components/CardMenu";
import { CcCategorisePanel, type CcCategorisePanelHandle } from "../CcCategorisePanel";
import { CcBulkEditDialog } from "../CcBulkEditDialog";
import { sortByCompleteness } from "../ccPendingSubmissions";
import { ToolbarNoExport as NewTxnToolbar } from "../ccGridToolbar";
import { selectedIds } from "../ccSelection";
import { CC_SNACK } from "../ccCopy";
import { useCcCardLabel, useCcEmployeeSubmit, useCcSaveDraft } from "../useCcMutations";
import { useCcTransactions, useCcUserInfo, useCreditCards } from "../useCc";
import { ccTxnComplete, type CcTransaction } from "../ccTypes";
import { FINANCE_EYEBROW } from "@constants/financeApps";

/**
 * One line, and no dashes. Which extra field a category asks for is something
 * the panel asks for directly, field by field; saying it again up here wrapped
 * onto a second line, and the height of that line is wanted by the list and the
 * panel — neither of which may scroll on this screen.
 */
const SUBTITLE = "Categorise your unsubmitted card transactions and submit them for lead approval.";

export default function CcNewTransactionsPage() {
  return (
    <FinanceShell
      eyebrow={FINANCE_EYEBROW.cc}
      title="Pending Submissions"
      subtitle={SUBTITLE}
      configured={isCcBackendConfigured()}
      configKey="ONE_WSO2_CC_EXPENSES_BACKEND_URL"
      fill
    >
      <NewTxnBody />
    </FinanceShell>
  );
}

/**
 * What the reader is in the middle of when they try to move on. The source
 * guards both of these, because both replace what the edit panel is showing:
 * a different row, or a bulk selection that puts the panel into read-only.
 */
type PendingAction =
  | { type: "rowChange"; rowId: number }
  | { type: "bulkSelection"; selection: Set<number> };

function NewTxnBody() {
  const userInfo = useCcUserInfo();
  const cards = useCreditCards();
  const txns = useCcTransactions();
  const submit = useCcEmployeeSubmit();
  const saveDraft = useCcSaveDraft();
  const renameCard = useCcCardLabel();
  const { showSuccess, showError } = useNotifications();

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  // Categorisation in progress, keyed by txn id. Persisted through
  // /transactions/save-draft — this is the copy the list reads, so the tick
  // and the submit gate follow the panel live.
  const [edits, setEdits] = useState<Record<number, CcTransaction>>({});
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Bumped by a bulk edit so the panel re-seeds from the changed row. The panel
  // is otherwise deliberately uncontrolled once mounted.
  const [bulkVersion, setBulkVersion] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [switching, setSwitching] = useState(false);
  const panel = useRef<CcCategorisePanelHandle>(null);

  const email = userInfo.data?.workEmail;
  const ownCards = useMemo(
    () => (cards.data ?? []).filter((c) => c.employeeEmail === email),
    [cards.data, email],
  );
  const activeCard = selectedCard ?? ownCards[0]?.ccNumber ?? null;

  // `new` transactions on the active card, complete ones first
  // (NewTransactionsDataGrid.tsx:156-164), with any in-progress categorisation
  // applied afterwards.
  //
  // Sorted on the SERVER's copy, then edited — not the other way round. The
  // order must not shift under the reader while they fill a row in: finishing
  // the last required field would otherwise move that row to the top of the
  // list mid-edit, and the panel, which follows the first row until one is
  // picked, would jump to whatever landed underneath. The source sorts
  // `transactionData`, which likewise carries no unsaved edits.
  const rows = useMemo(() => {
    const base = (txns.data ?? []).filter(
      (t) => t.status === "new" && (!activeCard || t.ccNumber === activeCard),
    );
    return sortByCompleteness(base, ccTxnComplete).map((t) => edits[t.id] ?? t);
  }, [txns.data, activeCard, edits]);

  // Derived, not stored: a stale id — after a submit, or on switching cards —
  // falls back to the first row rather than leaving the panel on a row that is
  // no longer in the list.
  const activeRowId = rows.some((r) => r.id === selectedRowId) ? selectedRowId : rows[0]?.id ?? null;
  const selectedRow = rows.find((r) => r.id === activeRowId) ?? null;

  const checkedRows = rows.filter((t) => checked.has(t.id));
  const completeChecked = checkedRows.filter(ccTxnComplete);
  // :192-198 — a mixed selection is refused outright rather than quietly
  // submitting the good half, so the reader can see which rows are not ready.
  const submitDisabled =
    checked.size === 0 || completeChecked.length !== checked.size || submit.isPending;
  const bulkSelected = checked.size > 0;

  const saveRow = async (row: CcTransaction) => {
    setEdits((prev) => ({ ...prev, [row.id]: row }));
    await saveDraft.mutateAsync([row]);
  };

  const applyBulk = async (updated: CcTransaction[]) => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const row of updated) next[row.id] = row;
      return next;
    });
    await saveDraft.mutateAsync(updated);
    setBulkVersion((v) => v + 1);
  };

  // :200-251 — anything that swaps what the panel is showing goes through here,
  // so half-typed work is never dropped without being offered back.
  const runAction = (action: PendingAction) => {
    if (action.type === "rowChange") setSelectedRowId(action.rowId);
    else setChecked(action.selection);
  };

  const guard = (action: PendingAction) => {
    if (!panel.current?.hasUnsavedChanges()) {
      runAction(action);
      return;
    }
    setPending(action);
  };

  const saveAndContinue = async () => {
    if (!pending) return;
    setSwitching(true);
    const saved = (await panel.current?.saveNow()) ?? true;
    setSwitching(false);
    // A failed save keeps the dialog open: continuing would lose the very work
    // the reader just asked to keep.
    if (!saved) return;
    runAction(pending);
    setPending(null);
  };

  const discardAndContinue = () => {
    if (!pending) return;
    panel.current?.discard();
    runAction(pending);
    setPending(null);
  };

  const handleSubmit = () => {
    if (submitDisabled) return;
    const submittedIds = new Set(completeChecked.map((t) => t.id));
    submit.mutate(completeChecked, {
      onSuccess: () => {
        showSuccess(CC_SNACK.success.submitTransaction);
        // Prune only the submitted rows — clearing all of `edits` would discard
        // categorisation done on rows that were not ticked.
        setChecked(new Set());
        setEdits((prev) => {
          const next = { ...prev };
          submittedIds.forEach((id) => delete next[id]);
          return next;
        });
      },
      onError: (err) => showError(describeError(err)),
    });
  };

  const columns = useMemo<DataGrid.GridColDef<CcTransaction>[]>(
    () => [
      { field: "id", headerName: "ID", width: 70 },
      { field: "txnDescription", headerName: "Description", flex: 1, minWidth: 140 },
      {
        field: "txnDate",
        headerName: "Date",
        width: 105,
        renderCell: (p) => formatNice(p.value as string),
      },
      {
        field: "txnAmount",
        headerName: "Amount($)",
        type: "number",
        width: 100,
        renderCell: (p) => bareAmount(p.value as number),
      },
      {
        // :127-139 — a bare tick, nothing else. Whether a row is ready is the
        // only thing the list has to say about categorisation; what was chosen
        // is the panel's job.
        field: "complete",
        headerName: "",
        width: 46,
        sortable: false,
        filterable: false,
        renderCell: (p) =>
          ccTxnComplete(p.row) ? (
            <Tooltip title="Ready to submit">
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                <CheckCircleIcon
                  size={16}
                  aria-label={`Transaction ${p.row.id} is ready to submit`}
                  style={{ color: "var(--oxygen-palette-success-main)" }}
                />
              </Box>
            </Tooltip>
          ) : null,
      },
    ],
    [],
  );

  if (userInfo.isLoading || cards.isLoading) {
    return <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 1.5 }} />;
  }
  if (userInfo.isError || cards.isError) {
    return (
      <Alert severity="error">
        Couldn't load your cards. {describeError(userInfo.error ?? cards.error)}
      </Alert>
    );
  }
  if (ownCards.length === 0) {
    return <Alert severity="info">You don't have a corporate credit card assigned.</Alert>;
  }

  return (
    // Carries the shell's `fill` down to the split: the card row and any error
    // above it keep their own height, and everything left over is the split's.
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "stretch", md: "center" }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <CardMenu
          cards={ownCards}
          active={activeCard}
          onSelect={setSelectedCard}
          badge="countNew"
          onRename={(card, label) =>
            renameCard.mutate(
              { id: card.id, label },
              {
                onSuccess: () => showSuccess(CC_SNACK.success.updateCardLabel),
                onError: (err) => showError(describeError(err)),
              },
            )
          }
        />
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {/* :302-337 — both buttons say why they are disabled, which is the
              only place the mixed-selection rule is explained. */}
          <Tooltip title={checked.size === 0 ? "no transactions selected" : ""}>
            <span>
              <Button
                variant="outlined"
                onClick={() => setBulkOpen(true)}
                disabled={checked.size === 0 || submit.isPending}
                sx={{ fontWeight: 600, minWidth: 120 }}
              >
                Bulk Edit
                {checked.size > 0 && (
                  <Chip label={checked.size} size="small" color="primary" sx={{ ml: 0.75, height: 18, fontSize: 10.5 }} />
                )}
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            title={
              submitDisabled
                ? "Select only complete transactions to submit"
                : "Submit selected transactions"
            }
          >
            <span>
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={submitDisabled}
                sx={{ fontWeight: 600, minWidth: 120 }}
              >
                {submit.isPending ? "Submitting…" : "Submit"}
                {completeChecked.length > 0 && (
                  <Chip
                    label={completeChecked.length}
                    size="small"
                    sx={{ ml: 0.75, height: 18, fontSize: 10.5, bgcolor: "common.white" }}
                  />
                )}
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {submit.isError && <Alert severity="error" sx={{ mb: 2 }}>{describeError(submit.error)}</Alert>}

      {txns.isLoading ? (
        <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 1.5 }} />
      ) : txns.isError ? (
        <Alert severity="error">Couldn't load transactions. {describeError(txns.error)}</Alert>
      ) : rows.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", py: 3 }}>
          No new transactions on this card.
        </Typography>
      ) : (
        // The source's 50/50 split (NewTransactionsDataGrid.tsx:468-480): the
        // list stays visible while a row is categorised, which is the whole
        // point of the layout. Stacked below the md breakpoint, where two
        // half-width columns would leave neither usable.
        //
        // Both halves get the room left in the page and no more, claimed with
        // `flex: 1` down the chain from the shell's `fill`. The page then has
        // nothing to scroll; when the window is too short for the form, the
        // panel scrolls within its own card and the list keeps its place.
        //
        // Measured heights were tried here twice and got it wrong both times —
        // a hair too tall and the page grew a scrollbar of its own, a hair too
        // short and a band of dead space opened under the split. Flexbox is
        // exact by construction and needs nothing re-measured on resize.
        //
        // Below `md` the two halves stack, and the page scrolls as any other
        // screen does; two half-width columns would leave neither usable.
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems="stretch"
          sx={{ flex: { md: 1 }, minHeight: { xs: "auto", md: 0 } }}
        >
          <Box
            sx={{
              width: { xs: "100%", md: "50%" },
              // A definite height is what the grid needs to lay itself out at
              // all, and what keeps "Rows per page" on the bottom edge rather
              // than tucked under the last row.
              display: "flex",
              flexDirection: "column",
              height: { xs: 440, md: "100%" },
              minHeight: 0,
              // The highlight for the row the panel is showing. Here rather
              // than on the grid's own `sx`, which is the shared constant.
              "& .MuiDataGrid-row": { cursor: "pointer" },
              "& .MuiDataGrid-row.selected-row": {
                bgcolor: "action.selected",
                boxShadow: (theme) => `inset 3px 0 0 ${theme.palette.primary.main}`,
              },
              "& .MuiDataGrid-row.selected-row .MuiDataGrid-cell": { fontWeight: 600 },
            }}
          >
            <Box sx={{ flex: 1, minHeight: 0 }}>
            <DataGrid.DataGrid
              rows={rows}
              columns={columns}
              showToolbar
              slots={{ toolbar: NewTxnToolbar }}
              density="compact"
              disableRowSelectionOnClick
              checkboxSelection
              onRowClick={(p) => {
                const next = Number(p.id);
                if (next === activeRowId) return;
                guard({ type: "rowChange", rowId: next });
              }}
              getRowClassName={(p) => (p.id === activeRowId ? "selected-row" : "")}
              rowSelectionModel={{ type: "include", ids: new Set(checked) }}
              onRowSelectionModelChange={(model) => {
                // include/exclude — see selectedIds. Every row here is
                // selectable, which is exactly when the grid reports select-all
                // as an empty exclude-set.
                const next = selectedIds(model, rows);
                // :413-424 — only crossing between "nothing ticked" and
                // "something ticked" flips the panel's mode, so only that
                // crossing is worth interrupting the reader for.
                if (next.size > 0 !== checked.size > 0) {
                  guard({ type: "bulkSelection", selection: next });
                  return;
                }
                setChecked(next);
              }}
              initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
              pageSizeOptions={[5, 10, 25]}
              sx={FINANCE_GRID_SX}
            />
            </Box>
          </Box>

          {/* Nothing scrolls on this screen — not the page, not the list, not
              this panel. The form is kept short enough to fit instead: that is
              why the fields are paired across two columns, why there is no
              divider between them, and why the subtitle above is one line. */}
          <Box
            sx={{
              width: { xs: "100%", md: "50%" },
              // A flex column, so the panel inside can claim the column's full
              // height with `flex: 1` — which is what holds Save against the
              // bottom when there is room to spare. It used to ask for
              // `height: 100%` against a plain block instead, which never
              // resolved, leaving Save stranded mid-card.
              display: "flex",
              flexDirection: "column",
              height: { xs: "auto", md: "100%" },
              minHeight: 0,
              // The one thing on this screen that scrolls, and only when the
              // window is too short for the form — the card keeps its borders
              // and its place beside the list while its contents move, which is
              // what the source does rather than growing the page.
              overflowY: "auto",
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              p: 1.75,
            }}
          >
            {selectedRow ? (
              <CcCategorisePanel
                // Re-seeds on a row change and after a bulk edit, the two times
                // the values it is holding are no longer the row's.
                key={`${selectedRow.id}:${bulkVersion}`}
                ref={panel}
                txn={selectedRow}
                editMode={!bulkSelected}
                onDraftChange={(next) => setEdits((prev) => ({ ...prev, [next.id]: next }))}
                onSave={saveRow}
              />
            ) : (
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                Select a transaction to categorise it.
              </Typography>
            )}
          </Box>
        </Stack>
      )}

      <CcBulkEditDialog
        open={bulkOpen}
        txns={checkedRows}
        onClose={() => setBulkOpen(false)}
        onApply={applyBulk}
      />

      {/* :503-555, wording included. */}
      <Dialog open={pending !== null} onClose={() => !switching && setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>Unsaved changes</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 13.5 }}>
            You have unsaved edits. Save before switching context?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button size="small" variant="outlined" onClick={() => setPending(null)} disabled={switching}>
            Cancel
          </Button>
          <Button size="small" variant="outlined" color="error" onClick={discardAndContinue} disabled={switching}>
            Discard &amp; Continue
          </Button>
          <Button size="small" variant="contained" onClick={() => void saveAndContinue()} disabled={switching}>
            Save &amp; Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
