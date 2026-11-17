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

import type { VisibilityAnswer } from "@components/side-rail/visibilityFold";
import {
  isCcBackendConfigured,
  isExpenseBackendConfigured,
  isFinanceMasterDataBackendConfigured,
  isOpdBackendConfigured,
} from "@config/apiConfig";
import { FINANCE_APPS } from "@constants/financeApps";
import { ccHasAccess } from "../cc/ccTypes";
import { useCcUserInfo } from "../cc/useCc";
import { useExpenseAppData } from "../expense/useExpense";
import {
  type MasterDataUserInfo,
  masterDataHasAccess,
  useMasterDataUserInfo,
} from "../masterdata/useMasterDataAccess";
import { OPD_ROLE, opdHasRole } from "../opd/opdTypes";
import { useOpdUserInfo } from "../opd/useOpd";

// Items that declare `requires` in the registry but aren't explicitly mapped
// below must fail CLOSED — otherwise a renamed or newly-added restricted item
// would silently become visible to everyone. Per-user items (no `requires`)
// stay open.
const RESTRICTED_IDS = new Set(
  FINANCE_APPS.flatMap((app) => app.items)
    .filter((it) => it.requires && it.requires.length > 0)
    .map((it) => it.id),
);

/**
 * Whether Master Data is open to this reader.
 *
 * Takes the master-data backend's own `/user-info` rather than the portal's
 * capability set. It used to be `caps.has("admin")` — people-app privilege
 * 999 — which was the only signal available while this backend's `/user-info`
 * returned nothing but an email and an avatar. That made it wrong in both
 * directions: 999 is the portal's GENERIC administrator privilege, so a
 * portal admin saw all four rail rows and was then refused by the backend
 * (which gates on the `app-finance-masterdata-admin` group), while the finance
 * staff who hold that group saw no rows at all. See
 * `masterdata/useMasterDataAccess.ts` for the whole account.
 *
 * Still a plain function over already-fetched data, and still exported, for
 * the reason it always was: `MasterDataRoute` asks this ONE question and must
 * not mount the cc/opd/expense queries to get an answer — a slow or erroring
 * one of those held the page on a blank screen for a reader who was always
 * going to be let in. The route reaches it through `useMasterDataAccess`,
 * which wraps the same `masterDataHasAccess` this case calls, so the rail and
 * the route cannot drift apart.
 */
export function canSeeMasterData(user: MasterDataUserInfo | undefined): boolean {
  return masterDataHasAccess(user);
}

/**
 * The backends THIS HOOK reads — not the Finance perspective's app list, which
 * is longer. MIS, Banking and Due Diligence answer for themselves through their
 * own gates (`useMisGate`, `useBankingAccess`, `useDueDiligenceGate`), mounted
 * separately in `usePerspectiveVisibility`.
 */
export type FinanceGateApp = "cc" | "opd" | "expense" | "masterData";

const EVERY_FINANCE_GATE_APP: readonly FinanceGateApp[] = ["cc", "opd", "expense", "masterData"];

/**
 * Which backends each scoped `canSee` item actually reads, as ONE table rather
 * than one constant per caller — so a case added to the `canSee` switch below
 * and a `needs` list handed to the hook can't quietly drift apart. A caller
 * scoping itself to less than an item's own list here would see that item
 * silently answer "no" forever, for a backend it never asked; see the
 * dev-only check against this map inside `canSee`.
 */
const ITEM_BACKENDS: Readonly<Record<string, readonly FinanceGateApp[]>> = {
  "claim-approval": ["opd", "expense"],
  "cc-new": ["cc"],
  "cc-pending": ["cc"],
  "cc-history": ["cc"],
  "cc-approve": ["cc"],
  "cc-admin": ["cc"],
  "cc-autofill-rules": ["cc"],
  "finance-overview": ["cc", "opd", "expense"],
  "master-data-subsidiaries": ["masterData"],
  "master-data-departments": ["masterData"],
  "master-data-expense-types": ["masterData"],
  "master-data-credit-cards": ["masterData"],
  "master-data-invoice-account-mappings": ["masterData"],
};

/**
 * What `canSee("claim-approval")` reads. CC is deliberately absent: card
 * submissions are approved under Credit Card Expenses, never on the Claim
 * Approval screen, so that backend has no say in it.
 */
export const CLAIM_APPROVAL_GATE_APPS = ITEM_BACKENDS["claim-approval"];

/** What `canSee("finance-overview")` and the three raw flags below read. */
export const OVERVIEW_GATE_APPS = ITEM_BACKENDS["finance-overview"];

// Role-gates the Finance menu items against each app's OWN backend roles —
// not the coarse One WSO2 capabilities derived from people-app. The rail
// uses this so a menu item is only shown to someone who can actually use
// its page (e.g. cc "Approve Submissions" needs a cc-expenses lead/finance
// role, exactly like the page enforces). Only one of these items is under
// Me now (`claims`); the rest live under the Finance perspective.
//
// Only the restricted items are listed; anything not named here is a
// per-user view (New / Pending / History) and stays visible to everyone.
// `enabled` lets the caller avoid firing the finance /user-info calls at all
// — unlike `needs` below, which still fires every backend it names but skips
// waiting on the ones it doesn't.
export interface FinanceGate {
  canSee: (itemId: string) => boolean;
  isResolving: boolean;
  /**
   * Whether THIS item's own answer is final — per-item, not the aggregate
   * `isResolving`. `needs` still fetches every backend it names regardless of
   * which item is asked about, so `isResolving` stays true until ALL of them
   * answer even when ONE item's own backends already have. A caller folding
   * this gate into the rail (`financeVisibility`) needs the per-item answer,
   * or a finance item already decided stays unreachable behind a backend it
   * never read — see `firstVisibleLeaf`, the one place this is for.
   */
  itemAnswered: (itemId: string) => boolean;
  /**
   * The raw signals behind the `finance-overview` case, exposed so a caller
   * with a choice to make — which dashboard FinanceOverviewPage should
   * default to — can use the SAME resolved access `canSee` already computed,
   * rather than re-deriving it from the backends itself.
   */
  ccHasOwnCard: boolean;
  opdFinance: boolean;
  expenseFinance: boolean;
  /**
   * Whether each backend's own lookup failed outright, distinct from a reader
   * who simply holds no role there. `canSee` folds both into "no" for every
   * case here — a failed lookup is not a yes — so a caller showing gated UI
   * on a `false` answer needs these to tell "not for you" from "couldn't
   * check", and the matching `retry*` to offer a way back from the latter.
   */
  ccErrored: boolean;
  opdErrored: boolean;
  expenseErrored: boolean;
  retryCc: () => void;
  retryOpd: () => void;
  retryExpense: () => void;
}

/**
 * Every finance item's visibility, each decided by the backend that owns it.
 *
 * The portal's coarse capability set used to be passed in here, for the one
 * item that had no backend role of its own — master data. That backend now
 * answers for itself (`useMasterDataUserInfo`), so there is no finance item
 * left that people-app privileges decide, and the parameter is gone rather
 * than kept unused: a `caps` argument still in the signature is an invitation
 * to gate the next finance item on a portal-wide privilege too, which is the
 * mistake this change exists to undo.
 */
export function useFinanceGate(
  enabled = true,
  needs: readonly FinanceGateApp[] = EVERY_FINANCE_GATE_APP,
): FinanceGate {
  // `isResolving` below is all-or-nothing and every caller renders NOTHING
  // while it is true, so a backend named here can hold a screen blank whether
  // or not that screen's questions depend on it. Omitting `needs` keeps the old
  // behaviour — fetch and wait for all four — which is what the rail wants,
  // since it asks `canSee` about items belonging to each.
  const needsCc = needs.includes("cc");
  const needsOpd = needs.includes("opd");
  const needsExpense = needs.includes("expense");
  const needsMasterData = needs.includes("masterData");

  const cc = useCcUserInfo(enabled && needsCc);
  const opd = useOpdUserInfo(enabled && needsOpd);
  const expense = useExpenseAppData(enabled && needsExpense);
  const masterData = useMasterDataUserInfo(enabled && needsMasterData);

  const ccLeadOrFinance = ccHasAccess(cc.data, "lead") || ccHasAccess(cc.data, "finance");
  const ccFinance = ccHasAccess(cc.data, "finance");
  // Whether there is a card to report on at all — granted from the backend's
  // own CC-owner list (service.bal's `ACCESS_LEVEL_CC_OWNER`), not just
  // "employee". A lead/finance role also earns the tab: they read the
  // dashboard for their team or the company, not for a card of their own.
  const ccHasOwnCard = ccHasAccess(cc.data, "cc_owner") || ccLeadOrFinance;
  const opdFinance = opdHasRole(opd.data, OPD_ROLE.FINANCE_APPROVER);
  const expenseLead = Boolean(expense.data?.enableLeadView);
  const expenseFinance = Boolean(expense.data?.enableFinanceView);
  const ccErrored = cc.isError;
  const opdErrored = opd.isError;
  const expenseErrored = expense.isError;

  const canSee = (itemId: string): boolean => {
    // Dev-only: a scoped gate silently answers "no" for an item whose backend
    // it never fetched, which is correct for every item NOT in `needs` but a
    // real bug for one that is in `ITEM_BACKENDS` — a caller that trimmed its
    // `needs` list too far would see that item refuse everyone, forever, with
    // nothing in production to say why.
    if (process.env.NODE_ENV !== "production") {
      const required = ITEM_BACKENDS[itemId];
      const missing = required?.filter((app) => !needs.includes(app));
      if (missing && missing.length > 0) {
        console.warn(
          `useFinanceGate: canSee("${itemId}") depends on ${required.join(", ")}, ` +
            `but this caller's \`needs\` is missing ${missing.join(", ")}.`,
        );
      }
    }
    switch (itemId) {
      // Claim approval, in the Finance perspective — just its two tabs now,
      // Needs You and Decided, both spanning every claim type. CC does not
      // feed into this — its own approving lives entirely under Credit Card
      // Expenses, not here — so only the OPD and Expense flags decide whether
      // this entry appears at all.
      case "claim-approval":
        return opdFinance || expenseLead || expenseFinance;
      // Credit Card Expenses' three submitter-facing items — Pending
      // Submissions, Pending Approvals, History — are each the reader's OWN
      // transactions. Nothing to categorise, track or look back on without a
      // card, so a lead/finance role earns them in too (reading a team's or
      // the company's), same `ccHasOwnCard` as Overview's Credit Card tab.
      case "cc-new":
      case "cc-pending":
      case "cc-history":
        return ccHasOwnCard;
      case "cc-approve":
        return ccLeadOrFinance;
      case "cc-admin":
        return ccFinance;
      // Rules belong to a card, so only a card holder keeps them; a lead or Finance role alone has none.
      case "cc-autofill-rules":
        return ccHasAccess(cc.data, "cc_owner");
      // Finance → Overview. One rail entry for all three dashboards now —
      // see FinanceOverviewPage. Hidden entirely when NONE of the three would
      // have anything to show: no card of the reader's own (or team/company
      // view via a CC lead/finance role), no OPD finance-approver role, and
      // no expense finance role. A reader with only one of the three still
      // opens straight onto that tab's content; there is no per-tab hiding
      // inside the page.
      //
      // A FAILED lookup is not a yes. This used to read `|| opdErrored`, on
      // the reasoning that a bad minute from OPD's backend should not hide a
      // screen an approver is entitled to. The cost of that was the bug this
      // entry was reported for: `foldIdentityError` reports EVERY one of
      // these queries as `isError` whenever identity itself fails to resolve
      // (a token-refresh hiccup is enough), so `opdErrored` went true for
      // readers who hold no OPD role at all — the row appeared for them — and
      // went false again the moment identity recovered, so it appeared and
      // vanished and appeared again. An entry that shows itself to the wrong
      // people whenever a request fails is worse than one that stays hidden
      // until a backend can actually answer for it: a role is the only thing
      // that opens this now.
      case "finance-overview":
        return ccHasOwnCard || opdFinance || expenseFinance;
      // The four master-data tables. Finance reference data that the other
      // apps read and only finance writes, so all four answer the same way —
      // listed individually rather than as a prefix match so that a new tab
      // has to be named here before it appears, the same fail-closed rule
      // the default case enforces.
      //
      // Gated on this backend's OWN answer, like every other case here — not
      // on the portal's `admin` privilege, which is what it used to read and
      // which no finance role maps onto. `canSeeMasterData`'s comment has the
      // full reasoning.
      case "master-data-subsidiaries":
      case "master-data-departments":
      case "master-data-expense-types":
      case "master-data-credit-cards":
      case "master-data-invoice-account-mappings":
        return canSeeMasterData(masterData.data);
      default:
        // Per-user views (New / Pending / History) are open; any other item
        // that declares `requires` but reaches here fails closed rather than
        // leaking, so the menu can't drift ahead of the explicit mapping.
        return !RESTRICTED_IDS.has(itemId);
    }
  };

  // `isResolving` is the one answer here that can go BACKWARDS, and it is the
  // one every caller renders nothing on: `FinanceOverviewPage` returns null,
  // `ClaimApprovalPage` drops its tabs and its <Outlet />. So an answer that
  // un-settles is not a slower answer — it is a screen blanking and coming
  // back, which is the flickering.
  //
  // Monotonic by construction rather than by a latch. `isLoading` is the
  // wrong question: it is `isPending && isFetching`, so it reads FALSE in the
  // gap between a failed attempt and its retry, and TRUE again when the retry
  // fires — settled, unsettled, settled, with nothing about this reader
  // having changed. A latch over the top of that only froze whichever answer
  // happened to land first, which could be the half-loaded one.
  //
  // `hasAnswered` asks the question that actually has a stable answer: has
  // this backend finished having its say, FOR THE IDENTITY IT WAS ASKED
  // ABOUT? `isSuccess` and `isError` are terminal in React Query — a refetch
  // of an errored query keeps `status: "error"` until it succeeds — so
  // neither ever goes back to false for a given query, and a backend this
  // environment has no URL for is counted as answered because it is never
  // going to be asked.
  //
  // That makes `isResolving` monotonic per identity, not for the life of the
  // mount outright: `userSub` is part of every query key here, so an identity
  // retry (a decode failure moving `useAsgardeoSub` from "error" back to
  // "loading") or a different account signing in in the same tab both point
  // these queries at a key that has never answered, and `isResolving` goes
  // back to true — correctly, since that identity genuinely has not. What it
  // cannot do is flicker for a reason that has nothing to do with the
  // reader, which is the bug this replaced.
  const hasAnswered = (q: { isSuccess: boolean; isError: boolean }, configured: boolean) =>
    !configured || q.isSuccess || q.isError;

  // Per backend, not just the aggregate below — this is what lets
  // `itemAnswered` tell "my own backends are done" from "SOME backend this
  // caller asked about is still going", even when that other backend has
  // nothing to do with the item being asked. A backend left out of `needs`
  // reads as answered here too: its query is disabled, so it would otherwise
  // stay `pending` forever and pin every item false.
  const backendAnswered: Record<FinanceGateApp, boolean> = {
    cc: !needsCc || hasAnswered(cc, isCcBackendConfigured()),
    opd: !needsOpd || hasAnswered(opd, isOpdBackendConfigured()),
    expense: !needsExpense || hasAnswered(expense, isExpenseBackendConfigured()),
    // Counted here too, now that a master-data row waits on a real request
    // rather than on an identity field the rail already had. Left out, the
    // rail would call the four rows resolved while this query was still in
    // flight and render them hidden, then show them when it landed — the
    // appearing-and-vanishing row this hook's comments above are about.
    masterData: !needsMasterData || hasAnswered(masterData, isFinanceMasterDataBackendConfigured()),
  };

  const isResolving =
    enabled &&
    !(backendAnswered.cc && backendAnswered.opd && backendAnswered.expense && backendAnswered.masterData);

  // Per-item version of `isResolving`, for `financeVisibility` — see the
  // field's own doc on `FinanceGate`. An item outside `ITEM_BACKENDS` (there
  // is none today, but a future case could reach the switch's `default`
  // without being added here) falls back to the aggregate, the same answer
  // this gate always gave before `itemAnswered` existed — safe because it
  // can only make that one item wait LONGER than it strictly has to, never
  // answer it wrong.
  const itemAnswered = (itemId: string): boolean => {
    const required = ITEM_BACKENDS[itemId];
    return required ? required.every((app) => backendAnswered[app]) : !isResolving;
  };

  return {
    canSee,
    isResolving,
    itemAnswered,
    ccHasOwnCard,
    opdFinance,
    expenseFinance,
    ccErrored,
    opdErrored,
    expenseErrored,
    retryCc: () => void cc.refetch(),
    retryOpd: () => void opd.refetch(),
    retryExpense: () => void expense.refetch(),
  };
}

/** Rail and landing facts. Dashboard-tab fields stay on FinanceGate. */
export function financeVisibility(gate: FinanceGate): VisibilityAnswer {
  return {
    canSee: (id) => gate.canSee(id),
    resolving: gate.isResolving,
    answered: (id) => gate.itemAnswered(id),
    retry: () => undefined,
  };
}
