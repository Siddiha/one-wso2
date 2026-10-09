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

// What an approver needs to see when it's their turn: why their role is asked
// (Deal Desk: what the approvers after them will check), and, after a
// decision, one line saying what was recorded.

import type { ApprovalOutcome, ApprovalStep, ApprovalWorkflow } from "@features/sales/cado2/approvals/api/approvalTypes";
import { renewalStartWarning } from "@features/sales/cado2/quotes/form/renewalStart";

/** What kind of rule asked for the approval; picks the row's icon. */
export type ReasonKind = "discount" | "review" | "terms" | "term" | "downsell" | "payment" | "category" | "other";

/**
 * One reason, split for display. From the backend's sentence
 * "Line 2 · WSO2 API Control Plane (APIM): 45% discount is above the CRO's 40% limit":
 * title "Line 2 · WSO2 API Control Plane", group "APIM", figure "45%",
 * detail "Above the CRO's 40% limit".
 */
export interface ReasonRow {
  readonly kind: ReasonKind;
  readonly title: string;
  readonly detail: string;
  /** The number that triggered it, e.g. "45%". */
  readonly figure?: string;
  /** The product group of a line, e.g. "APIM". */
  readonly group?: string;
  /** In Deal Desk's summary: the approvals this point needs, e.g. ["CRO", "CFO"]. */
  readonly roles?: readonly string[];
}

const RULE: Record<string, { kind: ReasonKind; title: string }> = {
  DISCOUNT: { kind: "discount", title: "Discount" },
  REQUIRED_REVIEW: { kind: "review", title: "Required review" },
  SPECIAL_TERMS: { kind: "terms", title: "Special terms" },
  GOVERNING_TERMS: { kind: "terms", title: "Governing terms" },
  SHORT_TERM_NEW_CUSTOMER: { kind: "term", title: "Subscription term" },
  SHORT_TERM_RENEWAL: { kind: "term", title: "Subscription term" },
  EXTENDED_TERM: { kind: "term", title: "Subscription term" },
  EXTENDED_SAAS_TERM: { kind: "term", title: "Subscription term" },
  RENEWAL_DOWNSELL: { kind: "downsell", title: "Renewal downsell" },
  RENEWAL_DOWNSELL_CEO: { kind: "downsell", title: "Renewal downsell" },
  PAYMENT_TERMS: { kind: "payment", title: "Payment terms" },
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A step's reasons as display rows, once each. Deal Desk's own "reviews every quote" is left out. */
export function reasonRows(step: ApprovalStep): ReasonRow[] {
  const seen = new Set<string>();
  const rows: ReasonRow[] = [];
  for (const t of step.triggers) {
    if (t.rule === "DEAL_DESK_REVIEW" || seen.has(t.reason)) continue;
    seen.add(t.reason);
    const rule = RULE[t.rule] ?? { kind: "other" as const, title: "Approval rule" };
    const split = t.lineNumber > 0 ? t.reason.indexOf(": ") : -1;
    if (split < 0) {
      rows.push({ kind: rule.kind, title: rule.title, detail: t.reason });
      continue;
    }
    // "Line 2 · Product (Group)" and what about it.
    const head = t.reason.slice(0, split);
    const rest = t.reason.slice(split + 2);
    const grouped = /^(.*) \(([^()]+)\)$/.exec(head);
    const title = grouped ? grouped[1] : head;
    const group = grouped ? grouped[2] : undefined;
    const discount = /^([\d.]+%) discount (.*)$/.exec(rest);
    rows.push(
      discount
        ? { kind: rule.kind, title, group, figure: discount[1], detail: capital(discount[2].replace(/^is /, "")) }
        : { kind: rule.kind, title, group, detail: capital(rest) },
    );
  }
  return rows;
}

const CATEGORY_LABEL: Record<string, string> = {
  SUBSCRIPTION: "Subscription",
  SUPPORT: "Support",
  PROFESSIONAL_SERVICE: "Professional Service",
};

/**
 * For Deal Desk: lines whose category the rep chose because the product isn't
 * mapped, e.g. "Line 3 · WSO2 Onboarding" / "Category chosen by the rep:
 * Professional Service". Deal Desk verifies them (quote-submission.md D46).
 */
export function repCategoryPoints(
  lines: readonly { number: number; productName: string; category: string; categoryByRep: boolean }[],
): ReasonRow[] {
  return lines
    .filter((l) => l.categoryByRep)
    .map((l) => ({
      kind: "category" as const,
      title: `Line ${l.number} · ${l.productName}`,
      detail: `Category chosen by the rep: ${CATEGORY_LABEL[l.category] ?? l.category}`,
    }));
}

/**
 * For Deal Desk: a renewal that doesn't start the day after the renewed
 * opportunity ends (2026-10-09), e.g. "Start date" / "Starts 1 Mar 2027, not
 * 1 Feb 2027, the day after APIM Subs 2026 ends". The AM may choose it; Deal
 * Desk checks it. Nothing otherwise.
 */
export function renewalStartPoints(sheet: {
  readonly startDate: string;
  readonly renewalStart: { readonly date: string; readonly fromName: string; readonly differs: boolean } | null;
}): ReasonRow[] {
  if (!sheet.renewalStart?.differs || !sheet.startDate) return [];
  return [{ kind: "term", title: "Start date", detail: renewalStartWarning(sheet.startDate, sheet.renewalStart) }];
}

/**
 * For Deal Desk, who reviews every quote: everything non-standard about it,
 * from the approvals still to come. One row per point (a line, or a rule
 * such as special terms) with the approvals it needs; for a line discount,
 * the lowest limit it passes, where approvals start.
 */
export function deskSummary(steps: readonly ApprovalStep[], current: ApprovalStep): ReasonRow[] {
  const points = new Map<string, { row: ReasonRow; roles: string[] }>();
  for (const s of steps) {
    if (s.role === current.role || (s.status !== "WAITING" && s.status !== "PENDING")) continue;
    for (const row of reasonRows(s)) {
      // A parsed line discount is one point whatever the limit; anything else
      // (including a discount sentence in an unexpected format) by its text.
      const key = `${row.kind}|${row.title}|${row.kind === "discount" && row.figure ? "" : row.detail}`;
      const point = points.get(key);
      if (!point) points.set(key, { row, roles: [s.roleLabel] });
      else if (!point.roles.includes(s.roleLabel)) point.roles.push(s.roleLabel);
    }
  }
  return [...points.values()].map(({ row, roles }) => ({ ...row, roles }));
}

/**
 * The line shown after a decision is saved, e.g. "Approved as CRO." When
 * nothing else waits for the approver: "… Nothing else on this quote is
 * waiting for you."
 */
export function decisionNote(
  outcome: ApprovalOutcome,
  step: ApprovalStep,
  after: ApprovalWorkflow,
  approverRoles: readonly string[],
): string {
  if (outcome === "reject") return `Rejected as ${step.roleLabel}. The approval has stopped.`;
  if (outcome === "request-changes") return `Sent back for changes as ${step.roleLabel}.`;
  const mine = after.steps.filter((s) => approverRoles.includes(s.role) && (s.status === "WAITING" || s.status === "PENDING"));
  if (mine.some((s) => s.canAct)) return `Approved as ${step.roleLabel}.`;
  if (mine.length) return `Approved as ${step.roleLabel}. You approve as ${mine.map((s) => s.roleLabel).join(" and ")} later.`;
  return `Approved as ${step.roleLabel}. Nothing else on this quote is waiting for you.`;
}
