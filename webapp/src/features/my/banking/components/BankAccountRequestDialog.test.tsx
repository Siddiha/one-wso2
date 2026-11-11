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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useBanksMock = vi.hoisted(() => vi.fn());
vi.mock("@features/my/api/useBanks", () => ({
  useBanks: (enabled: boolean) => useBanksMock(enabled),
}));

vi.mock("@features/my/api/useCreateBankAccountRequest", () => ({
  useCreateBankAccountRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import BankAccountRequestDialog from "./BankAccountRequestDialog";
import type { CustomLocationMapEntry } from "@features/my/api/types";

/** Banks on file, filed under their full country names. */
const BANKS = [
  { bankName: "Central Bank of Sri Lanka", swiftCode: "CBCELKLX", bankCode: "8004", bankLocation: "Sri Lanka" },
  { bankName: "Hongkong Shanghai Bank", swiftCode: "HSBCSGS2", bankCode: "HSBC", bankLocation: "Singapore" },
  { bankName: "Bank of America", swiftCode: "BOFAUS3N", bankCode: "BOFA", bankLocation: "United States" },
];

function renderDialog(props: {
  allowAnyBankLocation?: boolean;
  employeeWorkLocation?: string;
  customLocationMap?: CustomLocationMapEntry[];
}) {
  return render(
    <BankAccountRequestDialog
      accountType="CONSULTANCY"
      employeeEmail="person@wso2.com"
      allCountries={["Sri Lanka", "Singapore", "United States"]}
      employeeWorkLocation={props.employeeWorkLocation ?? "Sri Lanka"}
      customLocationMap={props.customLocationMap ?? []}
      allowAnyBankLocation={props.allowAnyBankLocation}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
}

/** Step 1 is mandatory, so every Bank Location assertion has to pass it first. */
async function goToBankInfo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Account Holder's Name/i), "Person Person");
  await user.type(screen.getByLabelText(/Account Holder's Address/i), "No 23, Galle Road, Colombo");
  await user.type(screen.getByLabelText(/Account Holder's City/i), "Colombo");
  const country = screen.getByLabelText(/Account Holder's Country/i);
  await user.click(country);
  await user.click(await screen.findByRole("option", { name: "Sri Lanka" }));
  await user.type(screen.getByLabelText(/Account No/i), "1234567890");
  await user.click(screen.getByRole("button", { name: /Continue/i }));
}

async function bankLocationOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/Bank Location/i));
  const listbox = await screen.findByRole("listbox");
  return within(listbox)
    .getAllByRole("option")
    .map((option) => option.textContent);
}

beforeEach(() => {
  useBanksMock.mockReturnValue({ data: { banks: BANKS }, isLoading: false, isError: false });
});

describe("BankAccountRequestDialog Bank Location options", () => {
  it("keeps Consultancy on the employee's own location when the flag is unset", async () => {
    const user = userEvent.setup();
    renderDialog({});
    await goToBankInfo(user);

    expect(await bankLocationOptions(user)).toEqual(["Sri Lanka"]);
  });

  it("offers every location on file once an Admin files on someone's behalf", async () => {
    const user = userEvent.setup();
    renderDialog({ allowAnyBankLocation: true });
    await goToBankInfo(user);

    const options = await bankLocationOptions(user);
    expect(options).toContain("Singapore");
    expect(options).toContain("United States");
    // The employee's own location is still there, not replaced by the rest.
    expect(options).toContain("Sri Lanka");
  });

  it("keeps a mapped location selectable even when the banks file it under another name", async () => {
    const user = userEvent.setup();
    // "US" is what the map carries; the banks above are filed under
    // "United States", so only the mapped value itself keeps it reachable.
    renderDialog({
      allowAnyBankLocation: true,
      employeeWorkLocation: "Sri Lanka",
      customLocationMap: [{ location: "Sri Lanka", customMap: ["US"] }],
    });
    await goToBankInfo(user);

    expect(await bankLocationOptions(user)).toContain("US");
  });
});
