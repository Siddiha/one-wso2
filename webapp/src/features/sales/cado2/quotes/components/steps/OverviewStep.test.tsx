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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { AdapterDateFns, DatePickers } from "@wso2/oxygen-ui";
import type { Opportunity } from "@features/sales/cado2/quotes/api/quoteTypes";
import { emptyDraftForm, type DraftFormValues } from "@features/sales/cado2/quotes/form/draftForm";
import OverviewStep from "./OverviewStep";

const renewal: Opportunity = {
  id: "006A", name: "API Platform 2027", stageName: "Negotiation", closeDate: "2026-11-30", createdDate: "2026-09-01",
  currencyIsoCode: "USD", isWon: false, isClosed: false, directChannel: "Partner", dealType: "PARTNER",
  partner: { id: "001P", name: "Acme Reseller", role: "Reseller", recordType: null, billingAddress: null },
  recordTypeName: "Renewal", dealKind: "RENEWAL", arr: 34000,
  pricebook: { id: "01sUSD00000000001A", name: "USD Price Book (Current)" },
};
/** What the account search finds (set by one test). */
let searchResults: unknown[] = [];
/** The opportunity's currency in Salesforce (changed by one test). */
let oppCurrency = "USD";
/** The account's closed-won opportunities, for a renewal (2026-10-09). */
const wonList = [
  { ...renewal, id: "006W", name: "APIM Subs 2026", stageName: "Closed Won", isWon: true, isClosed: true,
    subsStartDate: "2026-02-01", subsEndDate: "2027-01-31" },
  { ...renewal, id: "006X", name: "IS Subs 2026", stageName: "Closed Won", isWon: true, isClosed: true,
    subsStartDate: "2026-04-01", subsEndDate: "2027-03-31" },
  { ...renewal, id: "006N", name: "No dates", stageName: "Closed Won", isWon: true, isClosed: true,
    subsStartDate: null, subsEndDate: null },
];
/** Which lists were asked for: open by default, won for a renewal. */
const asked: string[] = [];
const lookup = (data: unknown) => ({ data, isPending: false, isFetching: false, error: null });

vi.mock("@features/sales/cado2/quotes/api/useQuoteApi", () => ({
  MIN_ACCOUNT_SEARCH: 3,
  useAccountSearch: () => lookup(searchResults),
  useAccountOpportunities: (id: string | null, status = "open") => {
    if (id) asked.push(status);
    return lookup(status === "won" ? wonList : [{ ...renewal, currencyIsoCode: oppCurrency }]);
  },
  useAccountContacts: () => lookup([{ id: "003A", name: "Marco Ruiz" }, { id: "003B", name: "Ana" }]),
  useActiveLegalEntities: () => lookup([]),
  useCurrencies: () => lookup(["USD"]),
}));

/** What Products & Pricing will start from. */
function Pricing() {
  const [currency, book] = useWatch<DraftFormValues, ["currencyIsoCode", "defaultPricebookName"]>({
    name: ["currencyIsoCode", "defaultPricebookName"],
  });
  return <p>pricing: {currency || "none"} · {book || "none"}</p>;
}

/** The start date the form holds. */
function Start() {
  const start = useWatch<DraftFormValues, "startDate">({ name: "startDate" });
  return <p>start: {start || "none"}</p>;
}

function Harness({ values, locked = false }: { values: Partial<DraftFormValues>; locked?: boolean }) {
  const form = useForm<DraftFormValues>({ defaultValues: { ...emptyDraftForm(), ...values } });
  return (
    <DatePickers.LocalizationProvider dateAdapter={AdapterDateFns}>
      <FormProvider {...form}>
        <OverviewStep locked={locked} />
        <Pricing />
        <Start />
      </FormProvider>
    </DatePickers.LocalizationProvider>
  );
}

const account = {
  accountId: "001A", accountName: "Northwind", accountSalesRegion: "NA", accountSubRegion: "US East",
  accountAddress: { street: null, city: "Philadelphia", stateProvince: null, postalCode: null, country: "USA" },
};
const deal = {
  ...account, opportunityId: "006A", opportunityName: "API Platform 2027", dealType: "PARTNER" as const,
  partner: { id: "001P", name: "Acme Reseller", role: "Reseller", billingAddress: null }, dealKind: "RENEWAL" as const,
  recordTypeName: "Renewal", isRenewal: true,
};
const REST = ["Renewal", "WSO2 legal entity", "Start date"];

describe("OverviewStep — Salesforce first (2026-09-28)", () => {
  it("shows only the account search before anything is chosen", () => {
    render(<Harness values={{}} />);
    expect(screen.getByText("Choose the Salesforce account this quote is for.")).toBeInTheDocument();
    expect(screen.queryByText("Start here")).toBeNull();
    for (const r of REST) expect(screen.queryByRole("region", { name: r })).toBeNull();
  });

  it("ticks in what Salesforce has for the account, then offers its opportunities", async () => {
    render(<Harness values={account} />);
    const found = await screen.findByLabelText("Found in Salesforce for this account", {}, { timeout: 3000 });
    // The opportunity list waits until every finding is showing (2026-10-09).
    expect(screen.queryByRole("listbox", { name: "Opportunity" })).toBeNull();
    expect(await within(found).findByText("2 found", {}, { timeout: 3000 })).toBeInTheDocument(); // contacts, the last line
    expect(await screen.findByRole("listbox", { name: "Opportunity" })).toBeInTheDocument();
    expect(within(found).getByText("1 found, newest first")).toBeInTheDocument();
    expect(within(found).getByText("Philadelphia, USA")).toBeInTheDocument();
    for (const r of REST) expect(screen.queryByRole("region", { name: r })).toBeNull();
  });

  it("shows the account's location and sales region, not its name again", async () => {
    render(<Harness values={account} />);
    const found = await screen.findByLabelText("Found in Salesforce for this account", {}, { timeout: 3000 });
    await within(found).findByText("2 found", {}, { timeout: 3000 });
    // The name is shown above the findings; no "Account" line repeats it.
    expect(within(found).queryByText("Account")).toBeNull();
    expect(within(found).getByText("Location")).toBeInTheDocument();
    expect(within(found).getByText("NA")).toBeInTheDocument();
    expect(within(found).getByText("US East")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the picked account above its findings, without repeating it", async () => {
    const user = userEvent.setup();
    searchResults = [{
      id: "001N", name: "Northwind Logistics", salesRegion: "NA", subRegion: "US East",
      billingAddress: { street: null, city: "Philadelphia", stateProvince: null, postalCode: null, country: "USA" },
    }];
    render(<Harness values={{}} />);
    await user.type(screen.getByRole("combobox", { name: "Account" }), "North");
    await user.click(await screen.findByRole("option", { name: /Northwind Logistics/ }));

    expect(screen.getByLabelText("Chosen account")).toHaveTextContent("Northwind Logistics");
    const found = await screen.findByLabelText("Found in Salesforce for this account", {}, { timeout: 3000 });
    await within(found).findByText("2 found", {}, { timeout: 3000 });
    expect(within(found).queryByText("Northwind Logistics")).toBeNull();
    expect(within(found).queryByText("Found")).toBeNull();
    searchResults = [];
  });

  it("says when Salesforce has no sub-region, without stopping the quote", async () => {
    render(<Harness values={{ ...account, accountSubRegion: "" }} />);
    const found = await screen.findByLabelText("Found in Salesforce for this account", {}, { timeout: 3000 });
    await within(found).findByText("2 found", {}, { timeout: 3000 }); // the last line is in
    expect(within(found).getByText("NA")).toBeInTheDocument();
    expect(within(found).getByText("Not set in Salesforce")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stops the quote when the account has no sales region in Salesforce", async () => {
    render(<Harness values={{ ...account, accountSalesRegion: "", accountSubRegion: "" }} />);
    const found = await screen.findByLabelText("Found in Salesforce for this account", {}, { timeout: 3000 });
    expect(await within(found).findByText("Not set in Salesforce", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This account has no sales region in Salesforce");
    expect(screen.getByRole("alert")).toHaveTextContent("Sales_Regions__c");
  });

  it("shows the deal's findings, then the rest of the step", async () => {
    render(<Harness values={deal} />);
    const found = await screen.findByLabelText("What Salesforce says about this deal", {}, { timeout: 3000 });
    expect(await within(found).findByText("USD 34,000.00", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(within(found).getByText("Renewal")).toBeInTheDocument();
    expect(within(found).getByText("Partner-led · Acme Reseller (Reseller)")).toBeInTheDocument();
    // The subscription it covers, not its pipeline stage (2026-10-09).
    expect(within(found).getByText("No subscription dates in Salesforce")).toBeInTheDocument();
    expect(within(found).queryByText(/Negotiation/)).toBeNull();
    for (const r of REST) expect(await screen.findByRole("region", { name: r })).toBeInTheDocument();
  });

  it("warns inside the findings when Salesforce lacks the channel", async () => {
    render(<Harness values={{ ...deal, dealType: null, isRenewal: false, dealKind: "FIRST_SALE" }} />);
    expect(await screen.findByText(/doesn't say whether this is direct or partner-led/, {}, { timeout: 3000 })).toBeInTheDocument();
    // Not a renewal: no Renewal section.
    expect(await screen.findByRole("region", { name: "Start date" }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Renewal" })).toBeNull();
  });

  it("shows everything at once on a saved draft", () => {
    render(<Harness values={deal} locked />);
    expect(screen.getByLabelText("What Salesforce says about this deal")).toHaveTextContent("USD 34,000.00");
    for (const r of REST) expect(screen.getByRole("region", { name: r })).toBeInTheDocument();
  });

  it("asks for no currency: it is chosen with the price book on Products & Pricing", () => {
    render(<Harness values={deal} locked />);
    expect(screen.queryByRole("combobox", { name: /Currency/ })).toBeNull();
  });

  it("pre-fills the currency and price book from the chosen opportunity", async () => {
    render(<Harness values={account} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("option", { name: "API Platform 2027" }, { timeout: 3000 }));
    expect(screen.getByText("pricing: USD · USD Price Book (Current)")).toBeInTheDocument();
  });

  it("leaves the currency empty when the opportunity's isn't offered in CadO2", async () => {
    oppCurrency = "AUD";
    try {
      render(<Harness values={account} />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("option", { name: "API Platform 2027" }, { timeout: 3000 }));
      expect(screen.getByText("pricing: none · none")).toBeInTheDocument();
    } finally {
      oppCurrency = "USD";
    }
  });

  // 2026-10-09: a renewal renews closed-won opportunities and starts the day after they end.
  it("offers closed-won opportunities to renew, and starts the day after the renewed one ends", async () => {
    asked.length = 0;
    render(<Harness values={deal} locked />);
    expect(asked).toContain("open");
    expect(asked).toContain("won");

    await userEvent.click(screen.getByRole("option", { name: "APIM Subs 2026" }));

    expect(screen.getByText("start: 2027-02-01")).toBeInTheDocument();
    expect(screen.getByText("The day after APIM Subs 2026 ends")).toBeInTheDocument();
    expect(screen.queryByText(/Deal Desk will see this/)).toBeNull();
  });

  it("warns, without blocking, when a renewal starts another day", () => {
    render(<Harness values={{ ...deal, previousOpportunityIds: ["006W"], startDate: "2027-03-01" }} locked />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Starts 1 Mar 2027, not 1 Feb 2027, the day after APIM Subs 2026 ends. Deal Desk will see this.",
    );
  });

  // Review: changing the renewed opportunities keeps a start date the AM chose…
  it("keeps a start date the AM chose when the renewed opportunities change", async () => {
    render(<Harness values={{ ...deal, previousOpportunityIds: ["006W"], startDate: "2027-03-01" }} locked />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Change selection" }));
    await user.click(screen.getByRole("option", { name: "IS Subs 2026" }));

    expect(screen.getByText("start: 2027-03-01")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("not 1 Apr 2027, the day after IS Subs 2026 ends");
  });

  // …but follows the suggestion while it is still the suggestion, and drops it when its source goes.
  it("follows the suggestion, and clears it when no renewed opportunity has an end date", async () => {
    render(<Harness values={deal} locked />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("option", { name: "APIM Subs 2026" }));
    expect(screen.getByText("start: 2027-02-01")).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "IS Subs 2026" }));
    expect(screen.getByText("start: 2027-04-01")).toBeInTheDocument(); // the latest end now

    await user.click(screen.getByRole("option", { name: "APIM Subs 2026" }));
    await user.click(screen.getByRole("option", { name: "IS Subs 2026" }));
    await user.click(screen.getByRole("option", { name: "No dates" }));
    expect(screen.getByText("start: none")).toBeInTheDocument();
    expect(screen.getByText(/No dates has no\s+subscription end date in Salesforce/)).toBeInTheDocument();
  });
});
