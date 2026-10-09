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

import { describe, expect, it } from "vitest";
import type { ApprovalStep, ApprovalWorkflow } from "@features/sales/cado2/approvals/api/approvalTypes";
import { decisionNote, deskSummary, reasonRows, renewalStartPoints } from "./myApprovals";

const step = (role: ApprovalStep["role"], status: ApprovalStep["status"], over: Partial<ApprovalStep> = {}): ApprovalStep => ({
  stepId: 1, role, roleLabel: role === "DEAL_DESK" ? "Deal Desk" : role, branches: ["DISCOUNT"], dependsOn: [], triggers: [],
  status, requestedAt: null, actedAt: null, actedByEmail: null, comment: null, canAct: false, cantActReason: null, ...over,
});
const wf = (steps: readonly ApprovalStep[], status: ApprovalWorkflow["status"] = "IN_PROGRESS"): ApprovalWorkflow =>
  ({ status, createdAt: "2026-10-06T09:00:00Z", completedAt: null, steps });

describe("reasonRows", () => {
  const trigger = (rule: string, lineNumber: number, reason: string) => ({ rule, branch: "DISCOUNT" as const, lineNumber, reason });

  it("splits a line's discount into the line, its group, the figure and the limit", () => {
    const cfo = step("CFO", "PENDING", { triggers: [
      trigger("DISCOUNT", 2, "Line 2 · WSO2 API Control Plane (APIM): 45% discount is above the CRO's 40% limit"),
      trigger("DISCOUNT", 2, "Line 2 · WSO2 API Control Plane (APIM): 45% discount is above the CRO's 40% limit"),
    ] });
    expect(reasonRows(cfo)).toEqual([
      { kind: "discount", title: "Line 2 · WSO2 API Control Plane", group: "APIM", figure: "45%", detail: "Above the CRO's 40% limit" },
    ]);
  });

  it("keeps a line review and a quote-level rule readable", () => {
    const legal = step("LEGAL", "PENDING", { triggers: [
      trigger("REQUIRED_REVIEW", 1, "Line 1 · WSO2 Identity Server (IAM): Legal reviews every IAM line"),
      trigger("SPECIAL_TERMS", 0, "The quote includes special terms"),
    ] });
    expect(reasonRows(legal)).toEqual([
      { kind: "review", title: "Line 1 · WSO2 Identity Server", group: "IAM", detail: "Legal reviews every IAM line" },
      { kind: "terms", title: "Special terms", detail: "The quote includes special terms" },
    ]);
  });

  it("leaves out Deal Desk's own every-quote review", () => {
    expect(reasonRows(step("DEAL_DESK", "PENDING", { triggers: [trigger("DEAL_DESK_REVIEW", 0, "Deal Desk reviews every quote")] }))).toEqual([]);
  });
});

describe("deskSummary", () => {
  const trigger = (rule: string, lineNumber: number, reason: string) => ({ rule, branch: "DISCOUNT" as const, lineNumber, reason });

  it("gives Deal Desk each non-standard point once, with the approvals it needs", () => {
    const dd = step("DEAL_DESK", "PENDING", { canAct: true });
    const line = "Line 2 · WSO2 API Control Plane (APIM): 45% discount";
    const steps = [
      dd,
      step("CRO", "WAITING", { triggers: [trigger("DISCOUNT", 2, `${line} is above the Area GM's 30% limit`)] }),
      step("CFO", "WAITING", { triggers: [trigger("DISCOUNT", 2, `${line} is above the CRO's 40% limit`)] }),
      step("LEGAL", "WAITING", { triggers: [trigger("SPECIAL_TERMS", 0, "The quote includes special terms")] }),
      step("CEO", "CANCELLED", { triggers: [trigger("PAYMENT_TERMS", 0, "Not needed any more")] }),
    ];
    expect(deskSummary(steps, dd)).toEqual([
      { kind: "discount", title: "Line 2 · WSO2 API Control Plane", group: "APIM", figure: "45%",
        detail: "Above the Area GM's 30% limit", roles: ["CRO", "CFO"] },
      { kind: "terms", title: "Special terms", detail: "The quote includes special terms", roles: ["LEGAL"] },
    ]);
  });

  it("keeps two discount reasons apart when their wording isn't the usual one", () => {
    const dd = step("DEAL_DESK", "PENDING", { canAct: true });
    const steps = [dd,
      step("CRO", "WAITING", { triggers: [trigger("DISCOUNT", 0, "A first odd discount sentence")] }),
      step("CFO", "WAITING", { triggers: [trigger("DISCOUNT", 0, "A second odd discount sentence")] })];
    expect(deskSummary(steps, dd).map((r) => r.detail)).toEqual(["A first odd discount sentence", "A second odd discount sentence"]);
  });

  it("is empty when nothing comes after Deal Desk", () => {
    const dd = step("DEAL_DESK", "PENDING", { canAct: true });
    expect(deskSummary([dd], dd)).toEqual([]);
  });
});

describe("decisionNote", () => {
  const cro = step("CRO", "PENDING", { canAct: true });
  const roles = ["CRO", "CFO", "CEO"];

  it("is short when the approver's next step is open now (its panel shows next)", () => {
    expect(decisionNote("approve", cro, wf([step("CRO", "APPROVED"), step("CFO", "PENDING", { canAct: true })]), roles)).toBe("Approved as CRO.");
  });

  it("says when the approver's next step comes later", () => {
    expect(decisionNote("approve", cro, wf([step("CRO", "APPROVED"), step("AREA_GM", "PENDING"), step("CEO", "WAITING")]), roles))
      .toBe("Approved as CRO. You approve as CEO later.");
  });

  it("says when nothing else waits for the approver", () => {
    expect(decisionNote("approve", cro, wf([step("CRO", "APPROVED"), step("AREA_GM", "PENDING")]), roles))
      .toBe("Approved as CRO. Nothing else on this quote is waiting for you.");
  });

  it("names the role for a rejection or a send-back", () => {
    const after = wf([step("CRO", "REJECTED")], "REJECTED");
    expect(decisionNote("reject", cro, after, roles)).toBe("Rejected as CRO. The approval has stopped.");
    expect(decisionNote("request-changes", cro, after, roles)).toBe("Sent back for changes as CRO.");
  });
});

// 2026-10-09: Deal Desk checks a renewal that starts another day than the day
// after the renewed opportunity ends.
describe("renewalStartPoints", () => {
  const renewalStart = { date: "2027-02-01", fromName: "APIM Subs 2026", differs: true };

  it("points it out when the start differs", () => {
    expect(renewalStartPoints({ startDate: "2027-03-01", renewalStart })).toEqual([
      { kind: "term", title: "Start date", detail: "Starts 1 Mar 2027, not 1 Feb 2027, the day after APIM Subs 2026 ends" },
    ]);
  });

  it("says nothing when it starts as expected, or isn't known", () => {
    expect(renewalStartPoints({ startDate: "2027-02-01", renewalStart: { ...renewalStart, differs: false } })).toEqual([]);
    expect(renewalStartPoints({ startDate: "2027-02-01", renewalStart: null })).toEqual([]);
  });
});
