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
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { localIsoMonth } from "@utils/localDate";

vi.mock("@hooks/useAccessToken", () => ({ useAccessToken: () => async () => "token" }));
vi.mock("@asgardeo/react", () => ({ useAsgardeo: () => ({ isSignedIn: true }) }));
// The copy-reminder button reports its outcome through the notifications
// context; the page is rendered here without the provider.
const notify = { showSuccess: vi.fn(), showError: vi.fn() };
vi.mock("@context/notifications/NotificationsContext", () => ({
  useNotifications: () => notify,
}));

// Who is looking, and what each hook was asked for.
const role = { privileges: ["employee"] as string[] };
const asked = {
  summary: [] as { dateFrom: string | undefined; ownedCardsOnly: boolean; leadEmail?: string }[],
  compliance: [] as { ownedCardsOnly: boolean; enabled: boolean }[],
  managerCompliance: [] as { enabled: boolean }[],
  leadSummary: [] as { enabled: boolean }[],
  leadTeam: [] as { leadEmail: string | undefined }[],
};

const leadFixtures = {
  leads: [
    {
      leadEmail: "lead@wso2.com",
      leadName: "Lead Person",
      submitterCount: 3,
      transactionCount: 7,
      pendingAmount: 900,
      bucket0To7: 1,
      bucket8To14: 2,
      bucket15To30: 3,
      bucket30Plus: 1,
    },
  ],
  team: [
    {
      employeeEmail: "holder@wso2.com",
      cardHolderName: "Card Holder",
      transactionCount: 4,
      pendingAmount: 400,
      oldestPendingDays: 22,
      bucket0To7: 1,
      bucket8To14: 1,
      bucket15To30: 2,
      bucket30Plus: 0,
    },
  ],
};

vi.mock("../useCc", () => ({
  useCcUserInfo: () => ({
    data: { workEmail: "me@wso2.com", privileges: role.privileges },
    isLoading: false,
    isError: false,
  }),
  // Lead view's two queries. Recorded like the others so a test can assert
  // which of them a role actually fires.
  useCcLeadApprovalSummary: (enabled: boolean) => {
    asked.leadSummary.push({ enabled });
    return { data: leadFixtures.leads, isLoading: false, isError: false };
  },
  useCcLeadTeamCardHolders: (leadEmail: string | undefined) => {
    asked.leadTeam.push({ leadEmail });
    return { data: leadFixtures.team, isLoading: false, isError: false };
  },
  useCcLeadTeamUnsubmittedSummary: () => ({
    data: {
      avgDaysOutstanding: 9.5,
      ageBuckets: {
        a: { label: "0-7 days", amount: 100, count: 1 },
        b: { label: "30+ days", amount: 50, count: 1 },
      },
    },
    isLoading: false,
    isError: false,
  }),
  useCcTransactionSummary: (dateFrom: string | undefined, ownedCardsOnly: boolean, leadEmail?: string) => {
    asked.summary.push({ dateFrom, ownedCardsOnly, leadEmail });
    return {
      data: {
        current: { amount: 1250.5, count: 4, avgDaysToSubmit: 12.25 },
        ageBuckets: {
          a: { label: "0-30 days", amount: 250.5, count: 1 },
          b: { label: "31-60 days", amount: 1000, count: 3 },
        },
      },
      isLoading: false,
      isError: false,
    };
  },
  useCcSubmittedByCategory: () => ({
    data: [
      { category: "Travel", txnMonth: localIsoMonth(), amount: 300 },
      { category: "Software", txnMonth: localIsoMonth(), amount: 900 },
    ],
    isLoading: false,
    isError: false,
  }),
  useCcCardHolderCompliance: (
    _dateFrom: string | undefined,
    ownedCardsOnly: boolean,
    enabled: boolean,
  ) => {
    asked.compliance.push({ ownedCardsOnly, enabled });
    return {
      data: [
        {
          employeeEmail: "late@wso2.com",
          cardHolderName: "Late Filer",
          outstandingAmount: 700,
          transactionCount: 2,
          avgDaysToSubmit: 41.5,
          bucket0To7: 0,
          bucket8To14: 0,
          bucket15To30: 1,
          bucket30Plus: 1,
        },
      ],
      isLoading: false,
      isError: false,
    };
  },
  useCcManagerCompliance: (_dateFrom: string | undefined, enabled: boolean) => {
    asked.managerCompliance.push({ enabled });
    return {
      data: [
        {
          managerEmail: "lead@wso2.com",
          managerName: "Lead Person",
          reportCount: 1,
          outstandingAmount: 700,
          transactionCount: 2,
          avgPendingDays: 20,
          bucket0To7: 0,
          bucket8To14: 0,
          bucket15To30: 1,
          bucket30Plus: 1,
          reports: [
            {
              employeeEmail: "late@wso2.com",
              cardHolderName: "Late Filer",
              outstandingAmount: 700,
              transactionCount: 2,
              avgDaysToSubmit: 41.5,
              bucket0To7: 0,
              bucket8To14: 0,
              bucket15To30: 1,
              bucket30Plus: 1,
            },
          ],
        },
      ],
      isLoading: false,
      isError: false,
    };
  },
}));

vi.mock("../../components/FinanceShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { reportingWindowLabel } = await import("../ccDashboard");
const { default: CcDashboardPage } = await import("./CcDashboardPage");

const render = () =>
  rtlRender(
    <MemoryRouter>
      <CcDashboardPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  role.privileges = ["employee"];
  asked.summary.length = 0;
  asked.compliance.length = 0;
  asked.managerCompliance.length = 0;
  asked.leadSummary.length = 0;
  asked.leadTeam.length = 0;
  notify.showSuccess.mockClear();
  notify.showError.mockClear();
});

// index.tsx:63-65 — only a lead or finance gets the company-wide view and the
// compliance table; an ordinary card holder sees their own spend, full stop.
describe("who sees what", () => {
  it("gives a card holder no view switch and no compliance table", () => {
    render();
    expect(screen.queryByRole("combobox", { name: "View" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cardholders Details")).not.toBeInTheDocument();
    // index.tsx:64 scopes on `isAdminEligible && ...`, so the flag stays off
    // for a card holder — the backend already scopes them to their own cards.
    expect(asked.summary.at(-1)?.ownedCardsOnly).toBe(false);
  });

  it("never fires the compliance request for a card holder", () => {
    render();
    expect(asked.compliance.at(-1)?.enabled).toBe(false);
  });

  // index.tsx:79-83 — the view you land on follows the role you hold. A lead
  // opens on their own approval queue, not on the company-wide picture: the
  // portal used to open them on Admin, which the source never does.
  it("opens a lead on their own team's queue", () => {
    role.privileges = ["employee", "lead"];
    render();
    expect(screen.getAllByText(/'s team/).length).toBeGreaterThan(0);
    // Their own email, without going through a picker — they are the lead.
    expect(asked.leadTeam.at(-1)?.leadEmail).toBe("me@wso2.com");
    // And the all-leads overview is never fetched for them.
    expect(asked.leadSummary.every((c) => !c.enabled)).toBe(true);
  });

  it("opens finance on the company-wide view", () => {
    role.privileges = ["employee", "finance"];
    render();
    expect(screen.getByText("Cardholders Details")).toBeInTheDocument();
    expect(asked.summary.at(-1)?.ownedCardsOnly).toBe(false);
  });

  // :219 — the company-wide view is finance's alone.
  it("offers a lead Employee and Lead view, but not Admin", async () => {
    role.privileges = ["employee", "lead"];
    render();
    await userEvent.click(screen.getByRole("combobox", { name: "View" }));
    expect(screen.getByRole("option", { name: "Employee view" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Lead view" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Admin view" })).not.toBeInTheDocument();
  });

  it("offers finance all three", async () => {
    role.privileges = ["employee", "finance"];
    render();
    await userEvent.click(screen.getByRole("combobox", { name: "View" }));
    for (const name of ["Employee view", "Lead view", "Admin view"]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
  });

  // Finance picks a lead before seeing a team; a lead skips that step.
  it("walks finance from the all-leads table into one team and back", async () => {
    role.privileges = ["employee", "finance"];
    render();
    await userEvent.click(screen.getByRole("combobox", { name: "View" }));
    await userEvent.click(screen.getByRole("option", { name: "Lead view" }));

    expect(screen.getByText("Approvals waiting on each lead")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /View Lead Person's team/ }));

    expect(screen.getByText("Lead Person's team (Pending)")).toBeInTheDocument();
    expect(asked.leadTeam.at(-1)?.leadEmail).toBe("lead@wso2.com");
    // The figures follow the lead being read, not the whole company.
    expect(asked.summary.at(-1)?.leadEmail).toBe("lead@wso2.com");

    await userEvent.click(screen.getByRole("button", { name: "Back to all leads" }));
    expect(screen.getByText("Approvals waiting on each lead")).toBeInTheDocument();
  });

  it("narrows an approver to their own cards, and drops compliance with it", async () => {
    role.privileges = ["employee", "finance"];
    render();
    await userEvent.click(screen.getByRole("combobox", { name: "View" }));
    await userEvent.click(screen.getByRole("option", { name: "Employee view" }));
    await waitFor(() => expect(asked.summary.at(-1)?.ownedCardsOnly).toBe(true));
    expect(screen.queryByText("Cardholders Details")).not.toBeInTheDocument();
  });
});

// index.tsx:128-136 — the header states both windows the screen covers. The
// port had put the reporting window on the category table instead.
describe("the header", () => {
  it("states today and the reporting window", () => {
    render();
    // Twice over: once in the header, once on the Pending by Age tile, as
    // index.tsx:131 and PendingByAgeCard.tsx:45 both carry it.
    expect(screen.getAllByText(/^As of /)).toHaveLength(2);
    // Not just the prefix — the label itself, so a broken window still fails.
    expect(screen.getByText(`Reporting window: ${reportingWindowLabel()}`)).toBeInTheDocument();
  });

  it("does not repeat the window on the category table", () => {
    render();
    const subtitle = screen.getByText(/^Fully submitted amount/);
    expect(subtitle).not.toHaveTextContent("Reporting window");
    expect(subtitle.textContent).toMatch(/last 6 months$/);
  });
});

describe("the pending figures", () => {
  it("shows amount, count and average days", () => {
    render();
    // :194 — `formatCurrency(x).split(".")[0]`, so no cents, and the currency
    // is named rather than symbolised.
    expect(screen.getByText("USD 1,250")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("12.3")).toBeInTheDocument(); // one decimal
    expect(screen.getByText("days")).toBeInTheDocument();
  });

  it("lays the age buckets out as the backend named them", () => {
    render();
    expect(screen.getByText("0-30 days")).toBeInTheDocument();
    expect(screen.getByText("31-60 days")).toBeInTheDocument();
    // PendingByAgeCard.tsx:52-62 — one row per bucket, AGE / COUNT / VALUE.
    const ageRow = screen.getByText("31-60 days").closest("tr") as HTMLElement;
    const ageTable = ageRow.closest("table") as HTMLElement;
    expect(
      [...ageTable.querySelectorAll("th")].map((h) => h.textContent),
    ).toEqual(["AGE", "COUNT", "VALUE"]);
    expect(ageRow).toHaveTextContent("3");
    expect(ageRow).toHaveTextContent("USD 1,000");
  });

  // :34-38 — "All time" is the opening period and sends no lower bound.
  it("opens on all time, and asks for a bound once a period is picked", async () => {
    render();
    expect(asked.summary.at(-1)?.dateFrom).toBeUndefined();

    await userEvent.click(screen.getByRole("combobox", { name: "Period" }));
    await userEvent.click(screen.getByRole("option", { name: "Last 6 months" }));
    await waitFor(() => expect(asked.summary.at(-1)?.dateFrom).toBeDefined());
  });
});

describe("the category breakdown", () => {
  it("ranks categories by spend and totals the grid", () => {
    render();
    const rows = screen.getAllByRole("row");
    const categories = rows.map((r) => r.querySelector("td")?.textContent);
    expect(categories).toContain("Software");
    expect(categories.indexOf("Software")).toBeLessThan(categories.indexOf("Travel"));
    expect(screen.getAllByText("1,200").length).toBeGreaterThan(0); // 900 + 300
  });

  it("collapses the columns when the granularity widens", async () => {
    render();
    const monthlyCols = screen.getAllByRole("columnheader").length;

    await userEvent.click(screen.getByRole("combobox", { name: "Granularity" }));
    await userEvent.click(screen.getByRole("option", { name: "Annually" }));

    await waitFor(() =>
      expect(screen.getAllByRole("columnheader").length).toBeLessThan(monthlyCols),
    );
  });
});

// CardHolderComplianceTable.tsx:96-118 — eight columns, and the two oldest
// bands are called out in red when they are not empty. The port had reduced
// this to four columns, dropping the ageing split entirely.
describe("the cardholder table", () => {
  it("breaks each card holder's backlog into the four ageing bands", () => {
    role.privileges = ["employee", "finance"];
    render();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(
      expect.arrayContaining([
        "CARD HOLDER",
        "TOTAL OUTSTANDING (USD)",
        "# TRANSACTIONS",
        "AVG. DAYS TO SUBMIT",
        "0-7D",
        "8-14D",
        "15-30D",
        "30+D",
      ]),
    );
  });

  it("shows the row's figures without cents", () => {
    role.privileges = ["employee", "finance"];
    render();
    const row = screen.getByText("Late Filer").closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("700");
    expect(row).not.toHaveTextContent("700.00");
    expect(row).toHaveTextContent("41.5");
  });
});

// CcDashboardPage.tsx:659-760 — "Group by: Reporting Manager" rolls the backlog
// up under each manager, and each row can be expanded or copied as a reminder.
describe("the reporting-manager grouping", () => {
  const groupByManager = async () => {
    role.privileges = ["employee", "finance"];
    render();
    await userEvent.click(screen.getByRole("combobox", { name: "Group by" }));
    await userEvent.click(screen.getByRole("option", { name: "Group by: Reporting Manager" }));
  };

  it("swaps the card-holder rows for one row per reporting manager", async () => {
    await groupByManager();
    const row = screen.getByText("Lead Person").closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("700");
    // Their reports stay folded away until the row is expanded.
    expect(screen.queryByText("Late Filer")).not.toBeInTheDocument();
  });

  it("expands a manager into the individual reports behind them", async () => {
    await groupByManager();
    await userEvent.click(screen.getByRole("button", { name: "Expand reports" }));
    expect(screen.getByText("Late Filer")).toBeInTheDocument();
  });

  it("opens a mailto reminder for the manager instead of sending it from the app", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
    await groupByManager();

    await userEvent.click(screen.getByRole("button", { name: "Email reminder" }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0];
    expect(target).toBe("_blank");
    expect(url).toContain("mailto:lead%40wso2.com");
    const decoded = decodeURIComponent(url as string);
    expect(decoded).toContain("Hi Lead, 1 of your direct reports has unsubmitted credit card transactions:");
    expect(decoded).toContain("- Late Filer: 2 items, USD 700");
  });

  it("warns when the browser blocks the mailto popup", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    await groupByManager();

    await userEvent.click(screen.getByRole("button", { name: "Email reminder" }));

    expect(notify.showError).toHaveBeenCalledWith(
      "Unable to open your email client — check your browser's popup settings.",
    );
  });
});
