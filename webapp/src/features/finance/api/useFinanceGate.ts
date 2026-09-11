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

import { FINANCE_APPS } from "@constants/financeApps";
import { useCcUserInfo } from "../cc/useCc";
import { ccHasAccess } from "../cc/ccTypes";
import { useOpdUserInfo } from "../opd/useOpd";
import { OPD_ROLE, opdHasRole } from "../opd/opdTypes";
import { useExpenseAppData } from "../expense/useExpense";
import { isPreviewEnabled } from "@config/previewFeatures";

// Items that declare `requires` in the registry but aren't explicitly mapped
// below must fail CLOSED — otherwise a renamed or newly-added restricted item
// would silently become visible to everyone. Per-user items (no `requires`)
// stay open.
const RESTRICTED_IDS = new Set(
  FINANCE_APPS.flatMap((app) => app.items)
    .filter((it) => it.requires && it.requires.length > 0)
    .map((it) => it.id),
);

// Role-gates the Finance menu items (surfaced under Me) against each app's
// OWN backend roles — not the coarse One WSO2 capabilities derived from
// people-app. The rail uses this so a menu item is only shown to someone
// who can actually use its page (e.g. cc "Approve Submissions" needs a
// cc-expenses lead/finance role, exactly like the page enforces).
//
// Only the restricted items are listed; anything not named here is a
// per-user view (New / Pending / History) and stays visible to everyone.
// `enabled` lets the caller avoid firing the finance /user-info calls when
// the Me perspective isn't active (e.g. while on People Ops).
export interface FinanceGate {
  canSee: (itemId: string) => boolean;
  isResolving: boolean;
}

export function useFinanceGate(enabled = true): FinanceGate {
  const cc = useCcUserInfo(enabled);
  const opd = useOpdUserInfo(enabled);
  const expense = useExpenseAppData(enabled);

  const ccLeadOrFinance = ccHasAccess(cc.data, "lead") || ccHasAccess(cc.data, "finance");
  const ccFinance = ccHasAccess(cc.data, "finance");
  const opdFinance = opdHasRole(opd.data, OPD_ROLE.FINANCE_APPROVER);
  const expenseLead = Boolean(expense.data?.enableLeadView);
  const expenseFinance = Boolean(expense.data?.enableFinanceView);

  const canSee = (itemId: string): boolean => {
    switch (itemId) {
      // Claim approval, in the Finance perspective. The rules are the two
      // standalone apps' own, unchanged — only where they are read has moved.
      //
      // The entry appears when ANY claim is approvable by this person, so
      // holding one flag of the three is enough to get a screen with one thing
      // in it. Each tab inside is gated by its own id at its own route.
      case "claim-approval":
        return opdFinance || expenseLead || expenseFinance;
      // Either stage. userSlice-style independence: a person can hold both, or
      // just one, and the tab is the same screen either way.
      case "claim-approval-expense":
        return expenseLead || expenseFinance;
      // No lead stage exists for OPD — the backend grants role 555 or nothing.
      case "claim-approval-opd":
        return opdFinance;
      // Behind a preview flag until the Finance and Me new-claim entry points
      // are reconciled. Answered here as well as by removing the registry
      // entry, because the Finance overview builds its tiles by hand and asks
      // the gate by id — a registry-only change would leave that tile offering
      // a route that no longer exists.
      case "expense-new":
        return isPreviewEnabled("expenseSubmitter");
      case "cc-approve":
        return ccLeadOrFinance;
      case "cc-settings":
        return ccFinance;
      default:
        // Per-user views (New / Pending / History) are open; any other item
        // that declares `requires` but reaches here fails closed rather than
        // leaking, so the menu can't drift ahead of the explicit mapping.
        return !RESTRICTED_IDS.has(itemId);
    }
  };

  const isResolving = enabled && (cc.isLoading || opd.isLoading || expense.isLoading);
  return { canSee, isResolving };
}
