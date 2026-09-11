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

// Registry of the digiops-finance apps and their top-level menu items,
// surfaced inside the Me perspective — claims/expenses are something an
// employee submits and tracks for themself, same rationale as Leave. Every
// item is a native route (built under src/features/finance/*), so each
// carries a `path` — the left rail navigates straight to it.
//
// Transcribed from each app's own webapp nav (routes.tsx / route.ts /
// Sidebar). Finance app roles (USER / EMPLOYEE / LEAD / FINANCE) map onto
// One WSO2 capabilities as: USER/EMPLOYEE/all → everyone, LEAD → lead,
// FINANCE → admin (One WSO2 has no dedicated Finance privilege number).
// Each app's own backend still enforces its real role scheme; these
// capability gates just decide what shows in the rail.

import { CreditCardIcon, ReceiptTextIcon } from "@wso2/oxygen-ui-icons-react";
import { CC_PATH } from "@features/finance/cc/ccPaths";
import { expenseFinancePaths } from "@features/finance/expense/expenseFinancePaths";
import type { MenuApp } from "@constants/appMenu";

/**
 * Claims — under **Me**. Filing and tracking your own is something every
 * employee does.
 */
export const ME_FINANCE_APPS: readonly MenuApp[] = [
  {
    // Approving moved to Finance → Claim approval: it is work done for other
    // people, and this menu is for what you do for yourself.
    //
    // One app where there were two. Expense and OPD claims are both things you
    // file for yourself and track, and their histories are the same shape, so
    // they are one entry with a tab each rather than four entries between them.
    // The forms differ enough that adding a claim asks which type first.
    key: "claims",
    name: "Claims",
    icon: ReceiptTextIcon,
    purpose: "Expense and OPD claims — file one and track what you have filed.",
    items: [
      { id: "claims", label: "Claims", desc: "Expense and OPD claims you have filed.", path: "/me/claims" },
    ],
  },
];

// Every item id across the three apps — lets the rail dispatch gating to
// useFinanceGate (each app's OWN backend roles) instead of the coarse
// people-app capabilities, regardless of which perspective section it's
// rendered under.
/**
 * Credit card — under **Finance**. Unlike claims, a corporate card is not
 * something everyone has, so the app is not part of the set every employee
 * needs; it sits with the other finance operations instead.
 */
export const FINANCE_PERSPECTIVE_APPS: readonly MenuApp[] = [
  {
    key: "expense",
    name: "Expense Claims",
    icon: ReceiptTextIcon,
    purpose: "File a new expense claim, or track the ones already submitted.",
    items: [
      { id: "expense-new", label: "New Claim", desc: "File a new expense claim.", path: expenseFinancePaths.new },
      { id: "expense-history", label: "Claim History", desc: "Claims you have submitted, and where each one has got to.", path: expenseFinancePaths.history },
    ],
  },
  {
    key: "cc",
    name: "Credit Card Expenses",
    icon: CreditCardIcon,
    purpose: "Reconcile and submit corporate credit-card transactions for approval.",
    items: [
      { id: "cc-dashboard", label: "Dashboard", desc: "Unsubmitted spend, how long it has been sitting, and what has been claimed.", path: `${CC_PATH}/dashboard` },
      { id: "cc-new", label: "Pending Submissions", desc: "Unsubmitted card transactions to categorise and submit.", path: `${CC_PATH}/new` },
      { id: "cc-pending", label: "Pending Approvals", desc: "Submissions awaiting approval.", path: `${CC_PATH}/pending` },
      { id: "cc-approve", label: "Approve Submissions", desc: "Review and approve your team's submitted card transactions.", requires: ["lead", "admin"], path: `${CC_PATH}/approve` },
      { id: "cc-history", label: "History", desc: "Your submitted past card transactions.", path: `${CC_PATH}/history` },
      { id: "cc-settings", label: "Settings", desc: "Upload and reconcile bank statements (finance).", requires: ["admin"], path: `${CC_PATH}/settings` },
    ],
  },
];

/** Every finance-domain app, wherever it is surfaced. */
export const FINANCE_APPS: readonly MenuApp[] = [
  ...ME_FINANCE_APPS,
  ...FINANCE_PERSPECTIVE_APPS,
];

export const FINANCE_ITEM_IDS: ReadonlySet<string> = new Set([
  ...FINANCE_APPS.flatMap((app) => app.items.map((it) => it.id)),
  // Claim approval is not an item of any one app — it spans two of them — so it
  // is named here rather than derived. Without it the rail would fall back to
  // the people-app capabilities, which have no word for "expense finance
  // approver" and would show the entry to the wrong people.
  "claim-approval",
]);

// Eyebrow descriptors for FinanceShell, derived from the registry above so the
// chip on every finance screen can't drift from the app's own name and icon.
function eyebrowFor(key: string): { icon: MenuApp["icon"]; label: string } {
  const app = FINANCE_APPS.find((a) => a.key === key)!;
  return { icon: app.icon, label: app.name };
}

export const FINANCE_EYEBROW = {
  // Both claim forms wear the Claims eyebrow: they are two ways into one app
  // now, and their own titles say which type is being filed.
  claims: eyebrowFor("claims"),
  cc: eyebrowFor("cc"),
  expense: eyebrowFor("expense"),
} as const;
