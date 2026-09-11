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

// Wire types for the people-app backend endpoints behind the People Ops
// reports. Mirrors people-app's own webapp slice types so the two apps
// speak the same shapes to the same service — if a field looks redundant
// here (`jobRole` vs `designation`, `epf` vs the `epfNumber` column key),
// it is because the backend sends it that way, not because we chose it.

export enum EmployeeStatus {
  Active = "Active",
  Left = "Left",
  MarkedLeaver = "Marked leaver",
}

// A row of POST /employees/search. Every nullable field here is genuinely
// nullable in the DB — the report renders "—" for each rather than hiding
// the column, so an empty cell reads as "not set" instead of "not loaded".
export interface Employee {
  employeeId: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  employeeThumbnail: string | null;
  secondaryJobTitle: string | null;
  jobRole: string | null;
  externalDesignation: string | null;
  epf: string;
  workLocation: string;
  startDate: string;
  managerEmail: string;
  managerName: string | null;
  additionalManagerEmails: string | null;
  gender: string | null;
  continuousServiceDate: string | null;
  jobBand: number | null;
  employeeStatus: EmployeeStatus;
  probationEndDate: string | null;
  agreementEndDate: string | null;
  resignationDate: string | null;
  finalDayInOffice: string | null;
  finalDayOfEmployment: string | null;
  resignationReason: string | null;
  employmentType: string;
  designation: string;
  company: string;
  office: string | null;
  businessUnit: string;
  team: string;
  subTeam: string | null;
  unit: string | null;
  subordinateCount: number;
  employmentTypeId: number;
  careerFunctionId: number;
  designationId: number;
  companyId: number;
  officeId: number | null;
  businessUnitId: number;
  teamId: number;
  subTeamId: number | null;
  unitId: number | null;
  house: string | null;
  houseId: number | null;
}

export interface FilteredEmployeesResponse {
  employees: Employee[];
  totalCount: number;
}

// The filter set both the preview search and the CSV generator accept.
// Every key is optional; an omitted key means "don't filter on this".
//
// Two pairs are mutually exclusive by backend contract — set one or the
// other, never both:
//   employmentTypeId  ⟷ employmentTypeIds
//   employeeStatus    ⟷ employeeStatuses
// The filter drawer clears the sibling whenever it sets one of these.
export interface Filters {
  businessUnitId?: number;
  teamId?: number;
  subTeamId?: number;
  unitId?: number;
  careerFunctionId?: number;
  designationId?: number;
  companyId?: number;
  officeId?: number;
  employmentTypeId?: number;
  employmentTypeIds?: number[];
  managerEmail?: string;
  gender?: string;
  employeeStatus?: EmployeeStatus;
  employeeStatuses?: EmployeeStatus[];
  directReports?: boolean;
  // Drops people whose start date hasn't arrived yet (accepted offers who
  // haven't joined). Defaults ON for the Active Employees report.
  excludeFutureStartDate?: boolean;
  // "Marked leaver" is a distinct status from "Left": someone who has
  // resigned but is still employed through their notice period. The Active
  // report counts them as active by default, hence this defaults ON too.
  includeMarkedLeavers?: boolean;
}

export interface Pagination {
  limit?: number;
  offset?: number;
}

export interface Sort {
  sortField: string;
  sortOrder: "ASC" | "DESC";
}

export interface EmployeeSearchPayload {
  searchString?: string;
  filters: Filters;
  pagination: Pagination;
  sort: Sort;
  // Restricts results to the caller's own reports. The reports always send
  // false: they are org-wide by definition, and the backend only serves the
  // org-wide form to ADMIN callers.
  leadOnly?: boolean;
}

// Body of POST /reports/employees/generate. `columns` is the ordered list of
// canonical column keys (see reportColumns) — omitted entirely when empty so
// the backend falls back to its own default column set.
export interface EmployeeReportPayload {
  filters: Filters;
  columns?: string[];
}

// ---- org master data -------------------------------------------------------
//
// Dropdown sources for the filter drawer. Note the label field is NOT
// uniform across these: most use `name`, but careerFunction and designation
// name theirs after the entity. orgOptionLabel() below is the one place
// that knows this, so callers don't each re-derive it.

export interface BusinessUnit {
  id: number;
  name: string;
  head_email?: string;
  is_active?: boolean;
}

export interface Team {
  id: number;
  name: string;
  is_active?: boolean;
}

export interface SubTeam {
  id: number;
  name: string;
  is_active?: boolean;
}

export interface Unit {
  id: number;
  name: string;
  is_active?: boolean;
}

export interface CareerFunction {
  id: number;
  careerFunction: string;
}

export interface Designation {
  id: number;
  designation: string;
  jobBand: number | null;
}

export interface Company {
  id: number;
  name: string;
  prefix: string;
  location: string;
  allowedLocations: { location: string; probationPeriod: number | null }[];
}

export interface Office {
  id: number;
  name: string;
  location: string;
  workingLocations: string[];
}

export interface EmploymentType {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Manager {
  employeeId: string;
  workEmail: string;
}

// Anything the filter drawer can offer as an `{id, label}` choice.
export interface OrgOption {
  id: number;
  label: string;
}

// ---- Master Data → Org Structure -------------------------------------------
//
// The four org-chart entity kinds (business unit, team, sub team, unit) share
// one shape and one pair of endpoints, differing only in their URL — which is
// why one component and one hook family serve all four.

export interface OrgChartEntity {
  id: number;
  name: string;
  /** Empty string when no head is set — the backend sends "" rather than null. */
  headEmail: string;
  isActive: boolean;
  /**
   * Employees currently assigned. Non-zero blocks deactivation: the backend
   * rejects it with a 400, and the edit dialog disables the toggle so the
   * refusal is visible before anyone tries.
   */
  activeEmployeeCount: number;
}

export interface CreateOrgChartEntityPayload {
  /** Max 45 characters (backend constraint). */
  name: string;
  /** Max 254 characters. Empty string means "no head". */
  headEmail?: string | null;
}

// PATCH: every field optional, and only what changed is sent.
export interface UpdateOrgChartEntityPayload {
  name?: string;
  headEmail?: string | null;
  isActive?: boolean;
}

/** Which of the four entity kinds a screen is working with. */
export type OrgEntityKind = "businessUnit" | "team" | "subTeam" | "unit";

// ---- Org hierarchy ---------------------------------------------------------
//
// Every node below carries TWO identities, and confusing them is the one way
// to get this feature quietly wrong — both are plain integers, so nothing
// complains:
//
//   id        — the entity itself ("Platform", the team)
//   mappingId — the record placing it under one parent ("Platform under AI BU")
//
// The same team can sit under two business units, so it has one `id` and two
// `mappingId`s, with its own children and its own functional head under each.
// That is why creating a sub-team placement takes a business-unit-team's
// mappingId rather than a team's id.
//
// The paired head/active fields follow the same split: `headEmail` and
// `isActive` belong to the entity and are edited on the entity tabs;
// `mappingHeadEmail` and `mappingIsActive` belong to this placement and are
// edited in the hierarchy.
export interface OrgChartNode {
  id: number;
  name: string;
  /** The entity's own head — shown on the entity tabs, not editable here. */
  headEmail: string;
  /** Whether the ENTITY is active. An inactive entity is inactive everywhere. */
  isActive: boolean;
  mappingId: number;
  /** The functional head for THIS placement specifically. */
  mappingHeadEmail: string;
  /** Whether this PLACEMENT is active, independent of the entity. */
  mappingIsActive: boolean;
}

export type OrgChartUnit = OrgChartNode;

export interface OrgChartSubTeam extends OrgChartNode {
  units: OrgChartUnit[];
}

export interface OrgChartTeam extends OrgChartNode {
  subTeams: OrgChartSubTeam[];
}

// The root level has no mapping — a business unit is not placed under
// anything — so it carries entity fields plus its employee count only.
export interface OrgChartBusinessUnit {
  id: number;
  name: string;
  headEmail: string;
  isActive: boolean;
  activeEmployeeCount: number;
  teams: OrgChartTeam[];
}

/** Which level of the tree a placement is being created at. */
export type MappingLevel = "team" | "subTeam" | "unit";

// Create payloads. The parent id differs per level in a way worth reading
// twice: `businessUnitId` is an ENTITY id, while `businessUnitTeamId` and
// `businessUnitTeamSubTeamId` are MAPPING ids.
export interface CreateTeamMappingPayload {
  businessUnitId: number;
  teamId: number;
  headEmail?: string | null;
}

export interface CreateSubTeamMappingPayload {
  businessUnitTeamId: number;
  subTeamId: number;
  headEmail?: string | null;
}

export interface CreateUnitMappingPayload {
  businessUnitTeamSubTeamId: number;
  unitId: number;
  headEmail?: string | null;
}

/** PATCH body for any mapping level — "" clears the head. */
export interface UpdateMappingPayload {
  headEmail?: string | null;
  isActive?: boolean;
}

// A row of GET /employees/basic-info — the option shape for employee pickers.
// The endpoint returns Active and Marked-leaver employees (it excludes only
// fully Left ones), so a Marked-leaver — still employed, just scheduled to
// leave — can legitimately appear and be picked here.
export interface EmployeeBasicInfo {
  employeeId: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  employeeThumbnail?: string | null;
  externalDesignation?: string | null;
}

// The genders the backend recognises for the gender filter. Mirrors
// people-app's EmployeeGenders constant.
export const EMPLOYEE_GENDERS = ["Male", "Female", "Other"] as const;
