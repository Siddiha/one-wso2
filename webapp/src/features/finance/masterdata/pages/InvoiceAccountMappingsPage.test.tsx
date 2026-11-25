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
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { InvoiceAccountMappingFilter } from "../masterDataTypes";

/** Every filter the page has asked the search endpoint for, in order. */
const asked: InvoiceAccountMappingFilter[] = [];
/** Whether the page was willing to issue each of those requests. */
const enabledWith: boolean[] = [];

const costTypesState = { isError: false };
const autoCompleteState = {
  data: {
    costTypes: [
      { id: 1, label: "Air Ticket" },
      { id: 2, label: "Currency (per diem / allowances)" },
    ],
    engagementCodes: ["MKT-EVT-IND"],
    engagementCodeSuffixes: ["MKT-EVT"],
    departments: ["Marketing"],
  } as
    | {
        costTypes: { id: number; label: string }[];
        engagementCodes: string[];
        engagementCodeSuffixes: string[];
        departments: string[];
      }
    | undefined,
  isError: false,
};

vi.mock("../useMasterData", () => ({
  isFinanceMasterDataBackendConfigured: () => true,
  useGlCodes: () => ({ data: [], isError: false, refetch: vi.fn() }),
  useInvoiceCostTypes: () => ({
    data: [{ id: 1, name: "Air Ticket" }],
    isError: costTypesState.isError,
    refetch: vi.fn(),
  }),
  useInvoiceAccountMappingAutoComplete: () => ({
    data: autoCompleteState.data,
    isError: autoCompleteState.isError,
    refetch: vi.fn(),
  }),
  useInvoiceAccountMappings: (filters: InvoiceAccountMappingFilter, enabled: boolean) => {
    asked.push(filters);
    enabledWith.push(enabled);
    return {
      data: { mappings: [], totalCount: 0 },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
}));

const { default: InvoiceAccountMappingsPage } = await import("./InvoiceAccountMappingsPage");
const { NotificationsProvider } = await import("@context/notifications/NotificationsContext");

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NotificationsProvider>
        <InvoiceAccountMappingsPage />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

const lastAsked = () => asked.at(-1)!;

describe("Invoice Account Mappings page", () => {
  beforeEach(() => {
    asked.length = 0;
    enabledWith.length = 0;
    costTypesState.isError = false;
    autoCompleteState.isError = false;
    autoCompleteState.data = {
      costTypes: [
        { id: 1, label: "Air Ticket" },
        { id: 2, label: "Currency (per diem / allowances)" },
      ],
      engagementCodes: ["MKT-EVT-IND"],
      engagementCodeSuffixes: ["MKT-EVT"],
      departments: ["Marketing"],
    };
  });

  // The retired mappings are the minority a reader goes looking for on
  // purpose, so the first request is for the active ones alone.
  it("asks for the active mappings only, from the first page", () => {
    show();

    expect(lastAsked()).toEqual({ status: ["active"], limit: 100, offset: 0 });
    // Nothing is held back: the gate is only for an unresolved cost type.
    expect(enabledWith.at(-1)).toBe(true);
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("drops the status filter once Show Inactive is switched on", async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("switch", { name: /show inactive/i }));

    // Not `status: ["active", "inactive"]` — no status filter is already
    // every status, and asking both ways would be the same question twice.
    expect(lastAsked()).not.toHaveProperty("status");
    expect(lastAsked()).toMatchObject({ limit: 100, offset: 0 });
  });

  // Every settled value in the box is a request now, so an unsettled one
  // must not be: ten keystrokes are one query, not ten.
  it("waits for the typing to stop before the search term becomes a request", async () => {
    const user = userEvent.setup();
    show();
    const before = asked.length;

    await user.type(screen.getByRole("textbox", { name: /search mappings/i }), "MKT");

    expect(asked.slice(before).some((f) => "searchTerm" in f)).toBe(false);
    await waitFor(() => expect(lastAsked()).toMatchObject({ searchTerm: "MKT" }));
  });

  // Page four of a narrower result may not exist, and the empty table that
  // comes back is the one answer a reader cannot tell apart from "nothing
  // matches".
  it("goes back to the first page whenever the question changes", async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("switch", { name: /show inactive/i }));

    expect(lastAsked().offset).toBe(0);
  });

  it("keeps the filter panel behind a Show Filters toggle", async () => {
    const user = userEvent.setup();
    show();

    expect(screen.getByRole("button", { name: /show filters/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show filters/i }));

    expect(screen.getByRole("button", { name: /hide filters/i })).toBeInTheDocument();
  });

  // The rows can be entirely fine while the form's required Cost Type picker
  // has nothing to offer, so that failure is reported on its own.
  it("reports a failed cost type list without hiding the rows", () => {
    costTypesState.isError = true;
    show();

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });
});
