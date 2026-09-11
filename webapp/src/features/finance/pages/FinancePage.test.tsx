/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// The overview asks the gate per entry, so the mock answers per id rather than
// for one of them — the previous version said "no" to everything else, which
// would have hidden a second card without failing anything.
const gate = { allow: new Set<string>(), isResolving: false };

vi.mock("../api/useFinanceGate", () => ({
  useFinanceGate: () => ({
    canSee: (id: string) => gate.allow.has(id),
    isResolving: gate.isResolving,
  }),
}));

const { default: FinancePage } = await import("./FinancePage");

beforeEach(() => {
  // The card app's per-user screens are open to anyone today, so this is the
  // ordinary case.
  gate.allow = new Set(["cc-dashboard"]);
  gate.isResolving = false;
});

const show = () =>
  render(
    <MemoryRouter>
      <FinancePage />
    </MemoryRouter>,
  );

// The perspective was empty and said so. It holds Claim approval now, and a
// banner promising something later is wrong twice over: the thing arrived, and
// it tells someone who cannot use it nothing about why.
describe("the Finance overview", () => {
  it("does not promise something coming later", () => {
    gate.allow.add("claim-approval");
    show();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/being rebuilt/i)).not.toBeInTheDocument();
  });

  it("offers the approval queue to an approver", () => {
    gate.allow.add("claim-approval");
    show();
    const link = screen.getByRole("link", { name: /Claim approval/ });
    expect(link).toHaveAttribute("href", "/finance/claim-approval");
  });

  // A link to a screen that would turn them away is worse than no link.
  it("offers no approval link to someone who approves nothing", () => {
    show();
    expect(screen.queryByRole("link", { name: /Claim approval/ })).not.toBeInTheDocument();
  });

  it("offers the card app, which is not an approval screen", () => {
    show();
    const link = screen.getByRole("link", { name: /Credit Card Expenses/ });
    expect(link).toHaveAttribute("href", "/finance/cc/dashboard");
  });

  it("lists both to someone who has both", () => {
    gate.allow.add("claim-approval");
    show();
    expect(screen.getByRole("link", { name: /Claim approval/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Credit Card Expenses/ })).toBeInTheDocument();
  });

  // Reachable when the card app's own /user-info says no — a data state, not a
  // shape the code rules out.
  it("says so plainly when the gate allows nothing at all", () => {
    gate.allow = new Set();
    show();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing here for you yet/)).toBeInTheDocument();
    expect(screen.getByText(/Your own claims are under\s+Me/)).toBeInTheDocument();
  });

  // A home for finance operations, with more coming. A subtitle naming today's
  // one screen would need rewriting the moment the second one lands, and the
  // sibling perspectives name their domain rather than their contents.
  it("describes the perspective, not the one thing in it today", () => {
    gate.allow.add("claim-approval");
    show();
    const subtitle = screen.getByText(/Operations and tools for company finances/);
    expect(subtitle).toBeInTheDocument();
    expect(subtitle.textContent).not.toMatch(/claim/i);
    expect(subtitle.textContent).not.toMatch(/approv/i);
  });

  it("waits for the backends rather than flashing the wrong answer", () => {
    gate.isResolving = true;
    show();
    expect(screen.queryByRole("link", { name: /Claim approval/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing here for you yet/)).not.toBeInTheDocument();
  });
});

// The overview builds its tiles by hand and asks the gate by id, so removing an
// app from the registry does NOT remove its tile here. Gating the entry without
// gating the tile would leave a card offering a route that no longer exists.
describe("a preview feature's tile", () => {
  it("is absent when the gate says the feature is off", () => {
    gate.allow = new Set(["cc-dashboard"]); // expense-new withheld
    show();
    expect(screen.queryByText("Expense Claims")).not.toBeInTheDocument();
  });

  it("appears when the gate says it is on", () => {
    gate.allow = new Set(["cc-dashboard", "expense-new"]);
    show();
    expect(screen.getByText("Expense Claims")).toBeInTheDocument();
  });
});
