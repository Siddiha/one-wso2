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

import { describe, expect, it, vi } from "vitest";
import { useState, type JSX } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Opportunity } from "@features/sales/cado2/quotes/api/quoteTypes";
import OpportunityPicker from "./OpportunityPicker";

const opp = (id: string, name: string, over: Partial<Opportunity> = {}): Opportunity => ({
  id,
  name,
  stageName: "Proposal",
  closeDate: "2026-12-15",
  createdDate: "2026-03-12",
  currencyIsoCode: "USD",
  isWon: false,
  isClosed: false,
  directChannel: "Direct",
  dealType: "DIRECT",
  partner: null,
  recordTypeName: "First Sale",
  dealKind: "FIRST_SALE",
  arr: null,
  ...over,
});
const list = [
  opp("006A", "API Platform 2027", { subsStartDate: "2027-02-01", subsEndDate: "2028-01-31" }),
  opp("006B", "Identity renewal FY26", { stageName: "Closed Won", isWon: true, isClosed: true, createdDate: "2025-06-01", closeDate: "2026-06-30",
    subsStartDate: "2025-07-01", subsEndDate: "2026-06-30" }),
  opp("006C", "Choreo pilot", { createdDate: "2025-01-10", subsStartDate: null, subsEndDate: null }),
];

function Harness({ multiple = false, initial = [] as string[] }): JSX.Element {
  const [selected, setSelected] = useState<string[]>(initial);
  return <OpportunityPicker label="Opportunity" multiple={multiple} opportunities={list} loading={false} selected={selected} onChange={setSelected} />;
}
const options = () => within(screen.getByRole("listbox", { name: "Opportunity" })).getAllByRole("option");

describe("OpportunityPicker (F5 review: like the contact picker)", () => {
  // 2026-10-09: the subscription dates, not the stage, created and close dates.
  it("lists opportunities in the order given (newest created first), with their subscription dates", () => {
    render(<Harness />);
    expect(options().map((o) => o.getAttribute("aria-label"))).toEqual(["API Platform 2027", "Identity renewal FY26", "Choreo pilot"]);
    expect(options()[0]).toHaveTextContent("Subscription 1 Feb 2027 – 31 Jan 2028");
    expect(options()[2]).toHaveTextContent("No subscription dates in Salesforce");
    for (const o of options()) {
      expect(o).not.toHaveTextContent("Proposal");
      expect(o).not.toHaveTextContent(/Created|Closes/);
    }
  });

  it("closes once one is picked, and Change opens it again", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Search opportunity" }), "choreo");
    expect(options()).toHaveLength(1);
    await user.click(options()[0]);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByLabelText("Chosen: Choreo pilot")).toHaveTextContent("No subscription dates in Salesforce");
    expect(screen.getByLabelText("Chosen: Choreo pilot")).not.toHaveTextContent("Proposal");

    await user.click(screen.getByRole("button", { name: "Change opportunity" }));
    expect(screen.getByRole("listbox", { name: "Opportunity" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Chosen: Choreo pilot")).toBeInTheDocument();
  });

  // 2026-10-09: several are ticked in one go, then Done.
  it("with several allowed, ticks several in one go, then shows them as removable rows", async () => {
    render(<Harness multiple />);
    const user = userEvent.setup();
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
    expect(screen.getAllByRole("checkbox", { hidden: true })).toHaveLength(3);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Identity renewal FY26" }));
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Choreo pilot" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument(); // stays open
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(options()[1]).toHaveAttribute("aria-selected", "true");

    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Choreo pilot" })); // untick
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Choreo pilot" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByLabelText("Chosen: Identity renewal FY26")).toBeInTheDocument();
    expect(screen.getByLabelText("Chosen: Choreo pilot")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Identity renewal FY26" }));
    expect(screen.queryByLabelText("Chosen: Identity renewal FY26")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Change selection" }));
    expect(options().find((o) => o.getAttribute("aria-label") === "Choreo pilot")).toHaveAttribute("aria-selected", "true");
  });

  it("offers no Change when locked", () => {
    render(<OpportunityPicker label="Opportunity" opportunities={list} loading={false} selected={["006A"]} onChange={vi.fn()} locked />);
    expect(screen.getByLabelText("Chosen: API Platform 2027")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change opportunity" })).toBeNull();
  });

  // 2026-10-09: each opportunity says whether it is a renewal, an expansion or a first sale.
  it("shows each deal's type, and finds them by it", async () => {
    const typed = [
      opp("006A", "API Platform 2027"),
      opp("006R", "APIM renewal 2027", { dealKind: "RENEWAL", recordTypeName: "Renewal" }),
      opp("006T", "Choreo trial", { dealKind: "OTHER", recordTypeName: "Free Trial" }),
    ];
    render(<OpportunityPicker label="Opportunity" opportunities={typed} loading={false} selected={[]} onChange={vi.fn()} />);
    expect(options()[0]).toHaveTextContent("First Sale");
    expect(options()[1]).toHaveTextContent("Renewal");
    expect(options()[2]).toHaveTextContent("Free Trial");

    await userEvent.type(screen.getByRole("textbox", { name: "Search opportunity" }), "renewal");
    expect(options().map((o) => o.getAttribute("aria-label"))).toEqual(["APIM renewal 2027"]);
  });

  it("says what is missing when there is nothing to choose", () => {
    render(
      <OpportunityPicker label="Opportunity" opportunities={[]} loading={false} selected={[]} onChange={vi.fn()}
        emptyText="This account has no open opportunities in Salesforce." />,
    );
    expect(screen.getByText("This account has no open opportunities in Salesforce.")).toBeInTheDocument();
  });

  // 2026-10-09: the open list says what to do.
  it("tells the AM to choose from the list", async () => {
    render(
      <OpportunityPicker label="Opportunity" opportunities={list} loading={false} selected={["006A"]} onChange={vi.fn()}
        instruction="Choose the opportunity this quote is for" />,
    );
    expect(screen.queryByText("Choose the opportunity this quote is for")).toBeNull(); // a choice is showing
    await userEvent.click(screen.getByRole("button", { name: "Change opportunity" }));
    expect(screen.getByText("Choose the opportunity this quote is for")).toBeInTheDocument();
  });
});
