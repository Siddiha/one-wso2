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
import type { JSX } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyDraftForm, type DraftFormValues } from "@features/sales/cado2/quotes/form/draftForm";
import ContactPicker from "./ContactPicker";

const contacts = [
  { id: "003A", name: "Marco Ruiz", title: "Head of IT", email: "marco@acme.example" },
  { id: "003B", name: "Ana Payables", title: "Finance", email: "ap@acme.example" },
];

function Harness(): JSX.Element {
  const form = useForm<DraftFormValues>({ defaultValues: emptyDraftForm() });
  return (
    <FormProvider {...form}>
      <ContactPicker name="billingContact" issueField="contacts.billing" label="Billing contact" contacts={contacts} loading={false} />
      <Value />
    </FormProvider>
  );
}
function Value(): JSX.Element {
  const v = useWatch<DraftFormValues, "billingContact">({ name: "billingContact" });
  return <p>value: {v.mode} {v.sfContactId}</p>;
}

describe("ContactPicker", () => {
  // 2026-10-09: nothing is listed until the AM chooses to pick from Salesforce
  // (an open list on arrival read as a directory, not a choice).
  it("starts with nothing chosen and the two ways to choose, without a list", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    const empty = within(screen.getByLabelText("Billing contact: none chosen"));
    expect(empty.getByText("No billing contact chosen yet")).toBeInTheDocument();
    expect(empty.getByRole("button", { name: "Someone not in Salesforce…" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();

    await user.click(empty.getByRole("button", { name: "Choose from Salesforce" }));
    expect(screen.getByText("Choose the billing contact")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Billing contact" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText("value: none")).toBeInTheDocument();
  });

  it("searches the account's contacts and shows the choice as a card with Change", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Choose from Salesforce" }));
    const list = () => within(screen.getByRole("radiogroup", { name: "Billing contact" }));
    expect(list().getAllByRole("radio")).toHaveLength(2);

    await user.type(screen.getByRole("textbox", { name: "Search billing contact" }), "finance");
    expect(list().getAllByRole("radio")).toHaveLength(1);
    await user.click(list().getByRole("radio", { name: "Ana Payables" }));

    expect(screen.getByText("value: salesforce 003B")).toBeInTheDocument();
    const card = within(screen.getByLabelText("Billing contact: Ana Payables"));
    expect(card.getByText("Finance · ap@acme.example")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change billing contact" }));
    expect(screen.getByRole("radiogroup", { name: "Billing contact" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Billing contact: Ana Payables")).toBeInTheDocument();
  });

  it("takes someone not in Salesforce, typed in", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Someone not in Salesforce…" }));
    expect(screen.getByText("value: manual")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pick from Salesforce instead" }));
    expect(screen.getByRole("radiogroup", { name: "Billing contact" })).toBeInTheDocument();
  });
});
