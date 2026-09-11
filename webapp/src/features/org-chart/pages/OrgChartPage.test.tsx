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

// Exercises the Company filter dropdown end to end: it renders, isolates the
// tree to the selected company plus the ancestor path to the Chairman,
// combines with the Teams legend filter by AND rather than replacing it, and
// gets cleared by Reset view. Everything else on the page (search, hide
// interns, expand all) already has its own coverage via manual/live testing
// during the port — this file is specifically for the new filter.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { EmployeeDirectoryRecord } from "../api/orgChartTypes";

const EMPLOYEES: EmployeeDirectoryRecord[] = [
  {
    employeeId: "1",
    firstName: "Chandra",
    lastName: "One",
    workEmail: "chairman@wso2.com",
    employeeThumbnail: null,
    designation: "Chairman",
    jobBand: null,
    startDate: "2000-01-01",
    managerEmail: "chairman@wso2.com",
    businessUnit: "Executive",
    team: "Executive",
    subTeam: null,
    unit: null,
    employmentType: "Full-Time",
    company: "WSO2 (Pvt) Ltd",
    workLocation: "Colombo",
    employeeStatus: "Active",
  },
  {
    employeeId: "2",
    firstName: "Vasu",
    lastName: "IndiaVP",
    workEmail: "vp-india@wso2.com",
    employeeThumbnail: null,
    designation: "VP",
    jobBand: null,
    startDate: "2005-01-01",
    managerEmail: "chairman@wso2.com",
    businessUnit: "Engineering",
    team: "Engineering",
    subTeam: null,
    unit: null,
    employmentType: "Full-Time",
    company: "WSO2- INDIA",
    workLocation: "Bengaluru",
    employeeStatus: "Active",
  },
  {
    employeeId: "3",
    firstName: "Esha",
    lastName: "IndiaEngineer",
    workEmail: "eng-india@wso2.com",
    employeeThumbnail: null,
    designation: "Engineer",
    jobBand: null,
    startDate: "2020-01-01",
    managerEmail: "vp-india@wso2.com",
    businessUnit: "Engineering",
    team: "Engineering",
    subTeam: null,
    unit: null,
    employmentType: "Full-Time",
    company: "WSO2- INDIA",
    workLocation: "Bengaluru",
    employeeStatus: "Active",
  },
  {
    employeeId: "4",
    firstName: "Hari",
    lastName: "IndiaHR",
    workEmail: "hr-india@wso2.com",
    employeeThumbnail: null,
    designation: "HR Partner",
    jobBand: null,
    startDate: "2021-01-01",
    managerEmail: "vp-india@wso2.com",
    businessUnit: "People Operations",
    team: "People Operations",
    subTeam: null,
    unit: null,
    employmentType: "Full-Time",
    company: "WSO2- INDIA",
    workLocation: "Bengaluru",
    employeeStatus: "Active",
  },
  {
    employeeId: "5",
    firstName: "Priya",
    lastName: "LankaVP",
    workEmail: "vp-lanka@wso2.com",
    employeeThumbnail: null,
    designation: "VP",
    jobBand: null,
    startDate: "2005-01-01",
    managerEmail: "chairman@wso2.com",
    businessUnit: "Sales",
    team: "Sales",
    subTeam: null,
    unit: null,
    employmentType: "Full-Time",
    company: "WSO2 (Pvt) Ltd",
    workLocation: "Colombo",
    employeeStatus: "Active",
  },
];

vi.mock("../api/useOrgChart", () => ({
  isOrgChartConfigured: () => true,
  useEmployeeDirectory: () => ({
    data: EMPLOYEES,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../util/exportOrgChartHtml", () => ({
  downloadOrgChartHtml: vi.fn(),
}));

const { default: OrgChartPage } = await import("./OrgChartPage");

// aria-label lands on the Select's outer MuiInputBase wrapper, not on the
// role="combobox" element itself, so it isn't part of that element's
// accessible name — it's the only combobox on this page, so querying by
// role alone is unambiguous.
function openCompanySelect() {
  const combo = screen.getByRole("combobox");
  fireEvent.mouseDown(combo);
  return combo;
}

function pickCompany(name: string) {
  openCompanySelect();
  const listbox = screen.getByRole("listbox");
  fireEvent.click(within(listbox).getByText(name));
}

describe("OrgChartPage company filter", () => {
  it("lists every distinct company, alphabetically, plus Global", () => {
    render(<OrgChartPage />);
    openCompanySelect();
    const listbox = screen.getByRole("listbox");
    const optionTexts = within(listbox)
      .getAllByRole("option")
      .map((el) => el.textContent);
    expect(optionTexts).toEqual(["Global", "WSO2 (Pvt) Ltd", "WSO2- INDIA"]);
  });

  it("isolates the tree to the selected company plus the ancestor path to the Chairman", () => {
    render(<OrgChartPage />);
    pickCompany("WSO2- INDIA");

    expect(screen.getByText(/Chandra/)).toBeInTheDocument();
    expect(screen.getByText(/Vasu/)).toBeInTheDocument();
    // Engineering is collapsed by default (only root starts open) — expand it.
    fireEvent.click(screen.getByText(/Vasu/));
    expect(screen.getByText(/Esha/)).toBeInTheDocument();
    expect(screen.getByText(/Hari/)).toBeInTheDocument();
    expect(screen.queryByText(/Priya/)).not.toBeInTheDocument();
  });

  it("combines with the Teams legend filter by AND, not by replacing it", () => {
    render(<OrgChartPage />);
    pickCompany("WSO2- INDIA");
    fireEvent.click(screen.getByText(/Vasu/)); // expand to see both India reports

    fireEvent.click(screen.getByText("Engineering"));

    expect(screen.getByText(/Esha/)).toBeInTheDocument();
    expect(screen.queryByText(/Hari/)).not.toBeInTheDocument();
  });

  it("Reset view clears the company filter back to Global", () => {
    render(<OrgChartPage />);
    pickCompany("WSO2- INDIA");
    expect(screen.queryByText(/Priya/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset view/i }));

    expect(screen.getByRole("combobox")).toHaveTextContent("Global");
    expect(screen.getByText(/Priya/)).toBeInTheDocument();
  });
});
