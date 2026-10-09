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

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Link as RouterLink, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { Box, Button, Chip, CircularProgress, Link, Stack, Tab, Tabs, Typography } from "@wso2/oxygen-ui";
import DeleteDraftDialog from "@features/sales/cado2/quotes/components/detail/DeleteDraftDialog";
import ErrorNotice from "@components/error-notice/ErrorNotice";
import {
  useAuditEvents,
  useCloseQuote,
  useQuote,
  useQuoteVersion,
  useRecallVersion,
  useReviseQuote,
} from "@features/sales/cado2/quotes/api/useQuoteApi";
import { sheetFromVersion } from "@features/sales/cado2/quotes/sheet/sheetModel";
import QuoteSheet from "@features/sales/cado2/quotes/components/sheet/QuoteSheet";
import DocumentsPanel from "@features/sales/cado2/quotes/components/detail/DocumentsPanel";
import StatusPanel from "@features/sales/cado2/quotes/components/detail/StatusPanel";
import CustomerBand from "@features/sales/cado2/quotes/components/sheet/CustomerBand";
import { STATUS_COLOR, quoteLabel, quoteStatusLabel } from "@features/sales/cado2/quotes/lifecycle/lifecycle";
import LifecycleDialog from "@features/sales/cado2/quotes/components/detail/LifecycleDialog";
import VersionsTab from "@features/sales/cado2/quotes/components/detail/VersionsTab";
import HistoryTab from "@features/sales/cado2/quotes/components/detail/HistoryTab";
import QuoteApprovals, { ApprovalSummary } from "@features/sales/cado2/approvals/components/QuoteApprovals";
import {
  useApprovalWorkflow,
  useDecideStep,
  useStoredApprovalPreview,
} from "@features/sales/cado2/approvals/api/useApprovalApi";
import type { ApprovalOutcome, ApprovalStep } from "@features/sales/cado2/approvals/api/approvalTypes";
import { decisionNote, renewalStartPoints, repCategoryPoints } from "@features/sales/cado2/approvals/model/myApprovals";
import YourApprovalPanel, { YOUR_APPROVAL_ANCHOR } from "@features/sales/cado2/approvals/components/YourApprovalPanel";
import { ArrowDownIcon, ArrowLeftIcon } from "@wso2/oxygen-ui-icons-react";
import { useCado2Me } from "@features/sales/cado2/api/useCado2Me";
import { cado2Paths, type Cado2QuoteTab } from "@features/sales/cado2/cado2Paths";
import { useDocumentTitle } from "@hooks/useDocumentTitle";

type Dialog = "recall" | "revise" | "close" | "delete" | null;

const scrollToYourApproval = () =>
  document.getElementById(YOUR_APPROVAL_ANCHOR)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
/** An approver's decision on one step. */
type Decision = { outcome: ApprovalOutcome; step: ApprovalStep } | null;
const TABS = ["Quote", "Approvals", "Versions", "History"] as const;
/** Each tab is a route: /quotes/:quoteId/<segment>. */
const TAB_SEGMENTS: readonly Cado2QuoteTab[] = ["quote", "approvals", "versions", "history"];
const APPROVALS_TAB = 1;

/**
 * The quote page: the latest
 * version as a complete read-only quote, every version with Compare, and the
 * History. The owner's lifecycle buttons follow the backend's `actions`
 *: Recall a submitted version; then Revise or Close. A draft can also
 * be closed.
 */
export default function QuoteDetailPage(): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  // Opened from My Approvals (?from=approvals): the back link returns there.
  const [search] = useSearchParams();
  const fromApprovals = search.get("from") === "approvals";
  const quoteId = Number(params.quoteId);
  const tab = TAB_SEGMENTS.indexOf(params.tab as Cado2QuoteTab);
  const openTab = (i: number) => navigate(cado2Paths.quote(quoteId, TAB_SEGMENTS[i], fromApprovals));
  const quote = useQuote(quoteId);
  const latestNumber = quote.data?.versions.at(-1)?.versionNumber ?? null;
  const latest = useQuoteVersion(quoteId, latestNumber);
  const recall = useRecallVersion();
  const revise = useReviseQuote();
  const close = useCloseQuote();
  const events = useAuditEvents(quoteId);
  const sheet = useMemo(() => (latest.data ? sheetFromVersion(latest.data) : null), [latest.data]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [decision, setDecision] = useState<Decision>(null);
  const latestStatus = latest.data?.version.status ?? null;
  const isDraft = latestStatus === "DRAFT";
  const workflow = useApprovalWorkflow(quoteId, latestNumber, latestStatus !== null && !isDraft);
  const approvalPreview = useStoredApprovalPreview(quoteId, latestNumber, isDraft);
  const decide = useDecideStep();
  const me = useCado2Me();
  // After a decision: what was recorded, shown above the next step (if any).
  // Kept with its quote, as the page stays mounted when another quote opens.
  const [decisionNoteState, setDecisionNoteState] = useState<{ quoteId: number; text: string } | null>(null);
  // Set by the header's "Your approval" from another tab; scrolls once the
  // Quote tab shows the panel.
  const jumpPending = useRef(false);
  useEffect(() => {
    if (!jumpPending.current || tab !== 0) return;
    jumpPending.current = false;
    scrollToYourApproval();
  }, [tab]);
  useDocumentTitle(quote.data ? quoteLabel(quote.data.quoteNumber, latest.data?.version.accountName, latest.data?.version.opportunityName) : "Quote");

  const openDialog = (d: Dialog) => {
    recall.reset();
    revise.reset();
    close.reset();
    setDialog(d);
  };

  if (tab < 0) return <Navigate to={cado2Paths.quote(quoteId, "quote", fromApprovals)} replace />;

  if (quote.isPending || (quote.data && latest.isPending)) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress aria-label="Loading the quote" />
      </Box>
    );
  }
  const loadError = quote.error ?? latest.error;
  if (loadError || !quote.data || !latest.data) {
    return (
      <ErrorNotice error={loadError} onRetry={() => void quote.refetch()} retrying={quote.isFetching}>
        Couldn&apos;t load the quote.
      </ErrorNotice>
    );
  }

  const q = quote.data;
  const v = latest.data.version;
  // The number once submitted; before that, the customer and deal.
  const name = quoteLabel(q.quoteNumber, v.accountName, v.opportunityName);
  const can = (a: "RECALL" | "REVISE" | "CLOSE") => q.actions.includes(a);
  const counts = [null, null, q.versions.length, events.data ? events.data.length : null];
  // Steps the caller may decide now; usually one.
  const actionable = (workflow.data?.steps ?? []).filter((s) => s.canAct);
  const approverRoles = me.data?.approverRoles ?? [];
  const noteForThisQuote = decisionNoteState?.quoteId === quoteId ? decisionNoteState.text : null;
  // Something to decide (or just decided): the "Your decision" band shows.
  const hasDecision = actionable.length > 0 || noteForThisQuote !== null;

  const approvalProps = { isDraft, workflow, preview: approvalPreview };
  // Opens the Quote tab if needed, then scrolls to "Your approval".
  const jumpToYourApproval = () => {
    if (tab === 0) {
      scrollToYourApproval();
      return;
    }
    jumpPending.current = true;
    openTab(0);
  };
  const openDecision = (outcome: ApprovalOutcome, step: ApprovalStep) => {
    decide.reset();
    setDecision({ outcome, step });
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 1400, minWidth: 0 }}>
      <Stack spacing={1.5}>
        <Link
          component={RouterLink}
          to={fromApprovals ? cado2Paths.approvals : cado2Paths.quotes}
          variant="body2"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, alignSelf: "flex-start" }}
        >
          <ArrowLeftIcon size={14} /> {fromApprovals ? "My Approvals" : "My Quotes"}
        </Link>
        {/* The record header (frontend.md, "Page titles"): the account is the
            page's title on every tab, with everything about who and what the
            quote is for; the deal below doesn't repeat it. */}
        {sheet ? (
          <CustomerBand
            sheet={sheet}
            header={{
              eyebrow: `${q.quoteNumber ?? "Draft"} · Version ${v.versionNumber}`,
              status: <Chip color={STATUS_COLOR[q.status]} label={quoteStatusLabel(q.status, v.versionNumber)} />,
              actions: (
                <>
                  {/* Decisions are made in "Your decision" on the Quote tab; from another tab this goes back there. */}
                  {actionable.length && tab !== 0 ? (
                    <Button variant="contained" endIcon={<ArrowDownIcon size={16} />} onClick={jumpToYourApproval}>
                      {actionable.length === 1 ? "Your approval" : `Your approvals (${actionable.length})`}
                    </Button>
                  ) : null}
                  {v.status === "DRAFT" && can("CLOSE") ? (
                    <Button variant="contained" component={RouterLink} to={cado2Paths.editVersion(q.id, v.versionNumber)}>
                      Continue draft v{v.versionNumber}
                    </Button>
                  ) : null}
                  {can("RECALL") ? (
                    <Button variant="contained" onClick={() => openDialog("recall")}>
                      Recall
                    </Button>
                  ) : null}
                  {can("REVISE") ? (
                    <Button variant="contained" onClick={() => openDialog("revise")}>
                      Revise
                    </Button>
                  ) : null}
                  {v.status === "DRAFT" && can("CLOSE") ? (
                    <Button color="error" variant="outlined" onClick={() => openDialog("delete")}>
                      Delete draft
                    </Button>
                  ) : null}
                  {can("CLOSE") ? (
                    <Button color="error" variant="outlined" onClick={() => openDialog("close")}>
                      Close quote
                    </Button>
                  ) : null}
                </>
              ),
            }}
          />
        ) : null}
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tab} onChange={(_, t: number) => openTab(t)} aria-label="Quote sections">
          {TABS.map((t, i) => (
            <Tab key={t} label={counts[i] === null ? t : `${t} (${counts[i]})`} />
          ))}
        </Tabs>
      </Box>
      <Box role="tabpanel" aria-label={TABS[tab]}>
        {tab === 0 && sheet ? (
          <Stack spacing={3}>
            {/* The approver's task first, full width and set apart from the deal below. */}
            {hasDecision ? (
              <Box
                component="section"
                aria-label="Your decision"
                sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2, bgcolor: "action.hover", border: 1, borderColor: "divider" }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1.5, lineHeight: 1.6 }}>
                  Your decision
                </Typography>
                <YourApprovalPanel
                  steps={workflow.data?.steps ?? []}
                  actionable={actionable}
                  note={noteForThisQuote}
                  repCategories={[...repCategoryPoints(sheet.lines), ...renewalStartPoints(sheet)]}
                  onDecide={openDecision}
                />
              </Box>
            ) : null}
            <Box
              sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", lg: "minmax(0,1fr) 320px" }, gap: 3, alignItems: "start" }}
            >
              <Box component="section" aria-label="The deal" sx={{ minWidth: 0 }}>
                <QuoteSheet sheet={sheet} withCustomer={false} />
              </Box>
              <StatusPanel
                latest={latest.data}
                events={events.data ?? []}
                approvals={<ApprovalSummary {...approvalProps} onOpen={() => openTab(APPROVALS_TAB)} />}
                documents={<DocumentsPanel quoteId={q.id} version={v.versionNumber} approved={v.status === "APPROVED"} />}
              />
            </Box>
          </Stack>
        ) : null}
        {tab === APPROVALS_TAB ? <QuoteApprovals {...approvalProps} /> : null}
        {tab === 2 ? <VersionsTab quote={q} currency={v.currencyIsoCode ?? ""} /> : null}
        {tab === 3 ? <HistoryTab quoteId={q.id} /> : null}
      </Box>

      {decision ? (
        <LifecycleDialog
          title={
            decision.outcome === "approve"
              ? `Approve as ${decision.step.roleLabel}?`
              : decision.outcome === "reject"
                ? `Reject ${name}?`
                : "Send it back for changes?"
          }
          confirmLabel={decision.outcome === "approve" ? "Approve" : decision.outcome === "reject" ? "Reject" : "Request changes"}
          reason={decision.outcome === "approve" ? "optional" : "required"}
          reasonLabel={decision.outcome === "approve" ? "Comment" : "What should the owner know?"}
          danger={decision.outcome === "reject"}
          pending={decide.isPending}
          error={decide.error}
          onClose={() => setDecision(null)}
          onConfirm={(comment) =>
            decide.mutate(
              { quoteId: q.id, version: v.versionNumber, stepId: decision.step.stepId as number, outcome: decision.outcome, comment },
              {
                onSuccess: (after) => {
                  // Say what was recorded, so the next step's buttons don't
                  // look like the same ones again.
                  setDecisionNoteState({ quoteId: q.id, text: decisionNote(decision.outcome, decision.step, after, approverRoles) });
                  setDecision(null);
                },
              },
            )
          }
        >
          {decision.outcome === "approve"
            ? `You approve version ${v.versionNumber} for ${decision.step.roleLabel}. The next approvers are asked straight away.`
            : decision.outcome === "reject"
              ? `The approval stops for everyone, and version ${v.versionNumber} is rejected. The owner can revise it or close the quote.`
              : `The approval stops for everyone, and the owner is asked to change version ${v.versionNumber} and submit again.`}
        </LifecycleDialog>
      ) : null}
      {dialog === "recall" ? (
        <LifecycleDialog
          title={`Recall version ${v.versionNumber}?`}
          confirmLabel="Recall"
          reason="optional"
          reasonLabel="Why are you recalling it?"
          pending={recall.isPending}
          error={recall.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            recall.mutate({ quoteId: q.id, version: v.versionNumber, reason }, { onSuccess: () => setDialog(null) })
          }
        >
          Version {v.versionNumber} will be taken back and can&apos;t be put back in flight. Afterwards you can revise it
          (start version {v.versionNumber + 1} as a copy) or close the quote.
        </LifecycleDialog>
      ) : null}
      {dialog === "revise" ? (
        <LifecycleDialog
          title={`Start version ${v.versionNumber + 1}?`}
          confirmLabel={`Create version ${v.versionNumber + 1}`}
          pending={revise.isPending}
          error={revise.error}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            revise.mutate(
              { quoteId: q.id },
              {
                onSuccess: (res) => {
                  setDialog(null);
                  navigate(cado2Paths.editVersion(q.id, res.version.versionNumber));
                },
              },
            )
          }
        >
          Version {v.versionNumber + 1} starts as an exact copy of version {v.versionNumber}, with the same prices. Version{" "}
          {v.versionNumber} stays as it is.
        </LifecycleDialog>
      ) : null}
      {dialog === "delete" ? (
        <DeleteDraftDialog
          quote={q}
          name={name}
          versionNumber={v.versionNumber}
          updatedAt={v.updatedAt}
          onClose={() => setDialog(null)}
          onDeleted={(res) => {
            setDialog(null);
            if (res.quoteDeleted) navigate(cado2Paths.quotes, { replace: true });
          }}
        />
      ) : null}
      {dialog === "close" ? (
        <LifecycleDialog
          title={`Close ${name}?`}
          confirmLabel="Close quote"
          reason="required"
          reasonLabel="Why is the quote closing?"
          danger
          pending={close.isPending}
          error={close.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => close.mutate({ quoteId: q.id, reason }, { onSuccess: () => setDialog(null) })}
        >
          This is permanent. The quote can&apos;t be revised or submitted again; its versions stay viewable.
        </LifecycleDialog>
      ) : null}
    </Stack>
  );
}
