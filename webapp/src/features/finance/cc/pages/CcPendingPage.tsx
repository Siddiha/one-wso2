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
  DataGrid,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
} from "@wso2/oxygen-ui";
import { isCcBackendConfigured } from "@config/apiConfig";
import FinanceShell from "../../components/FinanceShell";
import { StatusChip, ccStatusMeta } from "../../components/FinanceChips";
import { FINANCE_GRID_SX } from "../../util/financeGridSx";
import { describeError } from "../../util/financeError";
import { bareAmount, formatNice } from "../../util/financeFormat";
import { useNotifications } from "@context/notifications/NotificationsContext";
import { CardMenu } from "../components/CardMenu";
import { CcCategorisePanel, type CcCategorisePanelHandle } from "../CcCategorisePanel";
import { ToolbarNoExport as PendingToolbar } from "../ccGridToolbar";
import { CC_SNACK } from "../ccCopy";
import { useCcTransactions, useCcUserInfo, useCreditCards } from "../useCc";
import { useCcCardLabel, useCcSaveEdit } from "../useCcMutations";
import type { CcTransaction } from "../ccTypes";
import { FINANCE_EYEBROW } from "@constants/financeApps";

const SUBTITLE = "Your card transactions awaiting lead or finance approval.";

export default function CcPendingPage() {
  return (
    <FinanceShell
      eyebrow={FINANCE_EYEBROW.cc}
      title="Pending Approvals"
      subtitle={SUBTITLE}
      configured={isCcBackendConfigured()}
      configKey="ONE_WSO2_CC_EXPENSES_BACKEND_URL"
      fill
    >
      <PendingBody />
    </FinanceShell>
  );
}

/** Anything that replaces the row the panel is showing. */
type PendingAction =
  | { type: "rowChange"; rowId: number }
  | { type: "cardChange"; ccNumber: string };

function PendingBody() {
  const userInfo = useCcUserInfo();
  const cards = useCreditCards();
  const txns = useCcTransactions();
  const saveEdit = useCcSaveEdit();
  const renameCard = useCcCardLabel();
  const { showSuccess, showError } = useNotifications();

  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  // A correction in progress, keyed by txn id. Cleared on a successful save,
  // because `useCcSaveEdit` invalidates the list and what comes back is the
  // truth — unlike `/save-draft`, which deliberately does not refetch.
  const [edits, setEdits] = useState<Record<number, CcTransaction>>({});
  // Bumped on a successful save so the panel re-seeds from the refetched row.
  const [savedVersion, setSavedVersion] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [switching, setSwitching] = useState(false);
  const panel = useRef<CcCategorisePanelHandle>(null);

  const email = userInfo.data?.workEmail;
  const ownCards = useMemo(
    () => (cards.data ?? []).filter((c) => c.employeeEmail === email),
    [cards.data, email],
  );
  const activeCard = selectedCard ?? ownCards[0]?.ccNumber ?? null;

  // index.tsx:71-79 — this card, and both stages of approval. The port used to
  // list every card's pending rows at once, with no picker to narrow them.
  const rows = useMemo(() => {
    const base = (txns.data ?? []).filter(
      (t) =>
        t.employeeEmail === email &&
        (!activeCard || t.ccNumber === activeCard) &&
        (t.status === "pending_lead" || t.status === "pending_finance"),
    );
    return base.map((t) => edits[t.id] ?? t);
  }, [txns.data, email, activeCard, edits]);

  // Derived, not stored: a stale id — after a card switch, or once a row has
  // been approved out of the queue — falls back to the first row rather than
  // leaving the panel on something no longer listed.
  const activeRowId = rows.some((r) => r.id === selectedRowId) ? selectedRowId : rows[0]?.id ?? null;
  const selectedRow = rows.find((r) => r.id === activeRowId) ?? null;

  const saveRow = async (row: CcTransaction) => {
    await saveEdit.mutateAsync([row]);
    showSuccess(CC_SNACK.success.saveEdit);
    setEdits((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    setSavedVersion((v) => v + 1);
  };

  const runAction = (action: PendingAction) => {
    if (action.type === "rowChange") {
      setSelectedRowId(action.rowId);
      return;
    }
    setSelectedCard(action.ccNumber);
  };

  // The source has no guard here at all — clicking another row drops the
  // correction silently, and unlike the drafting screen there is no autosave
  // behind it to catch the loss. Ours asks, as Pending Submissions does.
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
    // A failed save keeps the dialog open: continuing would lose the correction
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
        // PendingTransactionsDataGrid.tsx:79-90 — this queue mixes both stages,
        // so which one a row is at is the column that earns its place here.
        field: "status",
        headerName: "Status",
        width: 130,
        align: "center",
        headerAlign: "center",
        renderCell: (p) => {
          const meta = ccStatusMeta(p.value as string);
          return <StatusChip label={meta.label} color={meta.color} />;
        },
      },
      {
        field: "txnAmount",
        headerName: "Amount($)",
        type: "number",
        width: 100,
        renderCell: (p) => bareAmount(p.value as number),
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
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ mb: 2 }}>
        <CardMenu
          cards={ownCards}
          active={activeCard}
          onSelect={(ccNumber) => guard({ type: "cardChange", ccNumber })}
          badge="countPendingLead"
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
      </Box>

      {txns.isLoading ? (
        <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 1.5 }} />
      ) : txns.isError ? (
        <Alert severity="error">Couldn't load transactions. {describeError(txns.error)}</Alert>
      ) : rows.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: "text.secondary", py: 3 }}>
          Nothing awaiting approval on this card.
        </Typography>
      ) : (
        // The same 50/50 split as Pending Submissions, and the same rules: the
        // page never scrolls, the panel scrolls inside its own card.
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems="stretch"
          sx={{ flex: { md: 1 }, minHeight: { xs: "auto", md: 0 } }}
        >
          <Box
            sx={{
              width: { xs: "100%", md: "50%" },
              display: "flex",
              flexDirection: "column",
              height: { xs: 440, md: "100%" },
              minHeight: 0,
              "& .MuiDataGrid-row": { cursor: "pointer" },
              "& .MuiDataGrid-row.selected-row": {
                bgcolor: "action.selected",
                boxShadow: (theme) => `inset 3px 0 0 ${theme.palette.primary.main}`,
              },
              "& .MuiDataGrid-row.selected-row .MuiDataGrid-cell": { fontWeight: 600 },
            }}
          >
            <Box sx={{ flex: 1, minHeight: 0 }}>
              {/* No checkbox column: nothing on this screen acts on a set of
                  rows. The source's grid has none either. */}
              <DataGrid.DataGrid
                rows={rows}
                columns={columns}
                showToolbar
                slots={{ toolbar: PendingToolbar }}
                density="compact"
                disableRowSelectionOnClick
                onRowClick={(p) => {
                  const next = Number(p.id);
                  if (next === activeRowId) return;
                  guard({ type: "rowChange", rowId: next });
                }}
                // The grid does not turn Enter or Space into a row click, so
                // without this a keyboard reader could move the focus ring down
                // the list while the panel stayed on the row they left — the
                // one thing this screen is for.
                onCellKeyDown={(p, e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  const next = Number(p.id);
                  if (next === activeRowId) return;
                  e.preventDefault();
                  guard({ type: "rowChange", rowId: next });
                }}
                getRowClassName={(p) => (p.id === activeRowId ? "selected-row" : "")}
                initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
                pageSizeOptions={[5, 10, 25]}
                sx={FINANCE_GRID_SX}
              />
            </Box>
          </Box>

          <Box
            sx={{
              width: { xs: "100%", md: "50%" },
              display: "flex",
              flexDirection: "column",
              height: { xs: "auto", md: "100%" },
              minHeight: 0,
              overflowY: "auto",
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              p: 1.75,
            }}
          >
            {selectedRow ? (
              <CcCategorisePanel
                // Re-seeds on a row change and after a save, the two times the
                // values it is holding are no longer the row's.
                key={`${selectedRow.id}:${savedVersion}`}
                ref={panel}
                txn={selectedRow}
                mode="review"
                editMode={false}
                // :232-237 — correctable while it is still with the lead; once
                // finance has it, it is theirs.
                enableEdit={selectedRow.status === "pending_lead"}
                onDraftChange={(next) => setEdits((prev) => ({ ...prev, [next.id]: next }))}
                onSave={saveRow}
              />
            ) : (
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                Select a transaction to see its details.
              </Typography>
            )}
          </Box>
        </Stack>
      )}

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
