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

// Backend base URLs. Read at runtime from window.config (same pattern as
// authConfig). Empty string = not configured; the calling hook should treat
// that as "backend not available" and render an appropriate state instead
// of firing broken requests.

export const peopleBackendUrl: string =
  window.config?.ONE_WSO2_PEOPLE_BACKEND_URL ?? "";

// Convenience — mirrors the AppConfig.serviceUrls shape used by people-app's
// own webapp so the two apps hit the same endpoints the same way.
export const peopleServiceUrls = {
  userInfo: `${peopleBackendUrl}/user-info`,
  // encodeURIComponent on the id for parity with every sibling builder
  // below — no current employeeId contains a reserved character, but a
  // future one could (and useUpdatePersonalInfo PATCHes through here).
  employee: (employeeId: string) =>
    `${peopleBackendUrl}/employees/${encodeURIComponent(employeeId)}`,
  employeePersonalInfo: (employeeId: string) =>
    `${peopleBackendUrl}/employees/${encodeURIComponent(employeeId)}/personal-info`,
  // Vehicles endpoints — keyed on the caller's email (backend enforces
  // employeeEmail === userInfo.email in the JWT). encodeURIComponent so
  // the `@` in the email survives the URL.
  employeeVehicles: (employeeEmail: string) =>
    `${peopleBackendUrl}/employees/${encodeURIComponent(employeeEmail)}/vehicles`,
  employeeVehicle: (employeeEmail: string, vehicleId: number) =>
    `${peopleBackendUrl}/employees/${encodeURIComponent(employeeEmail)}/vehicles/${vehicleId}`,
  // Returns the employee's building-access QR as a PNG binary. Non-admin
  // callers can only fetch their own (backend enforces isSelf check).
  employeeQrCode: (employeeId: string) =>
    `${peopleBackendUrl}/employees/${encodeURIComponent(employeeId)}/qr-code`,

  // POST, but a READ — filters/sort/pagination are too large for a query
  // string. Consumed with useQuery and the payload in the query key, per the
  // rule documented further down this file. `leadOnly: true` in the body is
  // what scopes the result to the caller's own reporting chain; the caller is
  // resolved server-side from the token, never sent.
  employeesSearch: `${peopleBackendUrl}/employees/search`,

  // Filter option lists. Five take an optional parent id — narrowing has to be
  // a round trip because the records carry no parent reference, so it cannot be
  // derived from lists already held. Omitting the id returns the full list.
  managers: `${peopleBackendUrl}/employees/managers`,
  employmentTypes: `${peopleBackendUrl}/employment-types`,
  businessUnits: `${peopleBackendUrl}/business-units`,
  careerFunctions: `${peopleBackendUrl}/career-functions`,
  companies: `${peopleBackendUrl}/companies`,
  teams: (businessUnitId?: number) =>
    businessUnitId === undefined
      ? `${peopleBackendUrl}/teams`
      : `${peopleBackendUrl}/teams?buId=${businessUnitId}`,
  subTeams: (teamId?: number) =>
    teamId === undefined
      ? `${peopleBackendUrl}/sub-teams`
      : `${peopleBackendUrl}/sub-teams?teamId=${teamId}`,
  units: (subTeamId?: number) =>
    subTeamId === undefined
      ? `${peopleBackendUrl}/units`
      : `${peopleBackendUrl}/units?subTeamId=${subTeamId}`,
  designations: (careerFunctionId?: number) =>
    careerFunctionId === undefined
      ? `${peopleBackendUrl}/designations`
      : `${peopleBackendUrl}/designations?careerFunctionId=${careerFunctionId}`,
  offices: (companyId?: number) =>
    companyId === undefined
      ? `${peopleBackendUrl}/offices`
      : `${peopleBackendUrl}/offices?companyId=${companyId}`,

  // ---- People Ops reports -------------------------------------------------
  //
  // POST. Streams the FULL filtered dataset back as CSV text (not JSON), so
  // it is read with authedPostText rather than authedPost. ADMIN-only.
  reportsEmployees: `${peopleBackendUrl}/reports/employees/generate`,
  // GET. Every ACTIVE employee's id/name/email — the backend filters on
  // employee_status itself, so this never carries leavers. Backs the
  // head-email pickers in Master Data. Admin-only.
  employeesBasicInfo: `${peopleBackendUrl}/employees/basic-info`,

  // ---- Master Data: org chart entities ------------------------------------
  //
  // Per-entity PATCH targets. The collection URLs above double as the POST
  // targets for creating one — note they are FUNCTIONS taking an optional
  // parent id (My Team's filters cascade); call them with no argument for the
  // full list, which is what these screens want.
  businessUnit: (id: number) => `${peopleBackendUrl}/business-units/${id}`,
  team: (id: number) => `${peopleBackendUrl}/teams/${id}`,
  subTeam: (id: number) => `${peopleBackendUrl}/sub-teams/${id}`,
  unit: (id: number) => `${peopleBackendUrl}/units/${id}`,

  // ---- Org hierarchy ------------------------------------------------------
  //
  // GET. The whole tree in one call: business units → teams → sub teams →
  // units, each node carrying both its entity fields and the fields of the
  // MAPPING that places it under its parent. Admin-only.
  companyOrgStructure: `${peopleBackendUrl}/company-org-structure`,

  // The mapping records themselves — one collection per level. POST creates a
  // placement, PATCH edits that placement's head or active flag.
  //
  // Note what the ids mean: a business-unit-team is created from a business
  // unit id + a team id, but the NEXT level down is created from that
  // mapping's id, not the team's. Placement is per-branch, so a team under
  // two business units has two mapping ids and its own children under each.
  businessUnitTeams: `${peopleBackendUrl}/business-unit-teams`,
  businessUnitTeam: (mappingId: number) =>
    `${peopleBackendUrl}/business-unit-teams/${mappingId}`,
  businessUnitTeamSubTeams: `${peopleBackendUrl}/business-unit-team-sub-teams`,
  businessUnitTeamSubTeam: (mappingId: number) =>
    `${peopleBackendUrl}/business-unit-team-sub-teams/${mappingId}`,
  businessUnitTeamSubTeamUnits: `${peopleBackendUrl}/business-unit-team-sub-team-units`,
  businessUnitTeamSubTeamUnit: (mappingId: number) =>
    `${peopleBackendUrl}/business-unit-team-sub-team-units/${mappingId}`,
};

// Promotion app backend (digiops-hr/apps/promotion). Separate service from
// people-app, so its own base URL. Same Choreo Bearer-token → x-jwt-assertion
// gateway rewrite pattern applies.
export const promotionBackendUrl: string =
  window.config?.ONE_WSO2_PROMOTION_BACKEND_URL ?? "";

// Banking app backend. Same Choreo Bearer-token → x-jwt-assertion gateway
// rewrite; does NOT require x-user-timezone-offset (only par-app +
// promotion-app do).
export const bankingBackendUrl: string =
  window.config?.ONE_WSO2_BANKING_BACKEND_URL ?? "";

export const bankingServiceUrls = {
  // GET /employee/accounts?employeeWorkEmail=<email> — the caller's bank
  // accounts. Backend allows self-lookup for non-admin callers.
  employeeAccounts: (workEmail: string) =>
    `${bankingBackendUrl}/employee/accounts?employeeWorkEmail=${encodeURIComponent(workEmail)}`,
};

// PAR (Performance Appraisal Review) app backend. Same Choreo gateway
// rewrite pattern as promotion-app. Also uses x-user-timezone-offset via
// digiopsHeaders().
export const parBackendUrl: string =
  window.config?.ONE_WSO2_PAR_BACKEND_URL ?? "";

export const parServiceUrls = {
  // GET /par-cycles?email=<workEmail>&status=OPEN — returns ParCycle[] for
  // the caller's own active review cycles. Non-lead/non-admin callers can
  // only query their own email.
  parCycles: (workEmail: string, status: "OPEN" | "CLOSED" | "PENDING" = "OPEN") =>
    `${parBackendUrl}/par-cycles?email=${encodeURIComponent(workEmail)}&status=${status}`,
  // GET /par-cycles/{cycleId}/employees/{workEmail}/par-ratings — returns
  // the caller's ParRating record for that cycle (contains
  // parEmployeeStatus / parLeadStatus we use for the chip + copy).
  parRating: (parCycleId: number, workEmail: string) =>
    `${parBackendUrl}/par-cycles/${parCycleId}/employees/${encodeURIComponent(workEmail)}/par-ratings`,
};

// Leave app backend (people-ops-suite/apps/leave-app). Its own service
// with its own /user-info + privilege scheme (LEAD=879, not people-app's
// 993). Same Choreo Bearer → x-jwt-assertion gateway rewrite; no
// x-user-timezone-offset needed.
export const leaveBackendUrl: string =
  window.config?.ONE_WSO2_LEAVE_BACKEND_URL ?? "";

export const leaveServiceUrls = {
  userInfo: `${leaveBackendUrl}/user-info`,
  appConfigs: `${leaveBackendUrl}/app-configs`,
  leaves: `${leaveBackendUrl}/leaves`,
  leave: (id: number) => `${leaveBackendUrl}/leaves/${id}`,
  // action = "approve" | "reject" (sabbatical only)
  leaveAction: (id: number, action: "approve" | "reject") =>
    `${leaveBackendUrl}/leaves/${id}/${action}`,
  employees: `${leaveBackendUrl}/employees`,
  // `years` maps to the repeated ?years= query the leave app sends. Omitting
  // it lets the backend pick its own period, which is what the congés-payés
  // leave year needs; France additionally asks for the calendar year so the
  // RTT row reads from that record (leaveService.ts:239-253).
  leaveEntitlement: (email: string, years?: number[]) => {
    const base = `${leaveBackendUrl}/employees/${encodeURIComponent(email)}/leave-entitlement`;
    if (!years || years.length === 0) return base;
    const qs = years.map((y) => `years=${encodeURIComponent(String(y))}`).join("&");
    return `${base}?${qs}`;
  },
};

export function isLeaveBackendConfigured(): boolean {
  return Boolean(leaveBackendUrl);
}

// The leave-app frontend itself (not its backend) — for deep-linking into
// flows this webapp doesn't replicate. Empty string = not configured; the
// caller should hide the link rather than render a broken relative URL.
export const leaveWebAppUrl: string =
  window.config?.ONE_WSO2_LEAVE_WEB_APP_URL ?? "";

export function isLeaveWebAppConfigured(): boolean {
  return Boolean(leaveWebAppUrl);
}

export const leaveAppUrls = {
  applySabbatical: `${leaveWebAppUrl}/apply/sabbatical`,
  approveSabbatical: `${leaveWebAppUrl}/approve/sabbatical`,
};

// ---- digiops-finance backends ---------------------------------------------
//
// The three finance apps (opd-claims, cc-expenses, expense-claims) are
// separate Ballerina services, each with its own base URL, its own
// /user-info + role scheme, and the same Choreo Bearer → x-jwt-assertion
// gateway rewrite. Receipts are raw-binary endpoints (not multipart), so
// the receipt helpers post the file bytes directly. Empty string = not
// configured; the FinanceShell renders a "not connected" state.

// OPD (outpatient medical) claims — opd-claims/backend.
export const opdBackendUrl: string =
  window.config?.ONE_WSO2_OPD_BACKEND_URL ?? "";

export function isOpdBackendConfigured(): boolean {
  return Boolean(opdBackendUrl);
}

export const opdServiceUrls = {
  userInfo: `${opdBackendUrl}/user-info`,
  appData: `${opdBackendUrl}/app-data`,
  searchClaims: `${opdBackendUrl}/search-claims`,
  claims: `${opdBackendUrl}/claims`,
  claimDrafts: `${opdBackendUrl}/claim-drafts`,
  claimStatus: (claimId: string) =>
    `${opdBackendUrl}/claims/${encodeURIComponent(claimId)}/status`,
  claimTransactions: (claimId: string) =>
    `${opdBackendUrl}/claims/${encodeURIComponent(claimId)}/transactions`,
  employees: `${opdBackendUrl}/employees`,
  // Raw-binary receipt endpoints. Upload is keyed on the caller's email.
  receiptUpload: (email: string) =>
    `${opdBackendUrl}/claims/${encodeURIComponent(email)}/transactions/receipts/file`,
  receiptFile: (fileName: string) =>
    `${opdBackendUrl}/claims/transactions/receipts/file/${encodeURIComponent(fileName)}`,
};

// Corporate credit-card expenses — cc-expenses/backend.
export const ccBackendUrl: string =
  window.config?.ONE_WSO2_CC_EXPENSES_BACKEND_URL ?? "";

export function isCcBackendConfigured(): boolean {
  return Boolean(ccBackendUrl);
}

export const ccServiceUrls = {
  userInfo: `${ccBackendUrl}/user-info`,
  creditCards: `${ccBackendUrl}/credit-cards`,
  // PATCH — rename a card. creditCard.ts:94-96.
  creditCardLabel: (id: number, label: string) =>
    `${ccBackendUrl}/credit-cards/${id}?label=${encodeURIComponent(label)}`,
  transactions: (query = "") => `${ccBackendUrl}/transactions${query}`,
  saveDraft: `${ccBackendUrl}/transactions/save-draft`,
  employeeSubmit: `${ccBackendUrl}/transactions/employee-submit`,
  saveEdit: `${ccBackendUrl}/transactions/save-edit`,
  leadApprove: `${ccBackendUrl}/transactions/lead-approve`,
  financeApprove: `${ccBackendUrl}/transactions/finance-approve`,
  processStatement: (bankCode: string, fileName: string) =>
    `${ccBackendUrl}/transactions/process-statement?bankCode=${encodeURIComponent(bankCode)}&statementFileName=${encodeURIComponent(fileName)}`,
  uploadTransactions: (bankCode: string, fileName: string) =>
    `${ccBackendUrl}/transactions?bankCode=${encodeURIComponent(bankCode)}&statementFileName=${encodeURIComponent(fileName)}`,
  // Dashboard analytics — config.ts:52-54.
  transactionSummary: `${ccBackendUrl}/transactions/new-transaction-summary`,
  submittedByCategory: `${ccBackendUrl}/transactions/submitted-transaction-summary`,
  cardHolderCompliance: `${ccBackendUrl}/transactions/card-holder-compliance-summary`,
  expenseTypes: `${ccBackendUrl}/configurations/expense-types`,
  subRegions: `${ccBackendUrl}/configurations/sub-regions`,
  productAndBusinessUnits: `${ccBackendUrl}/configurations/product-and-business-units`,
  jobNumbers: `${ccBackendUrl}/travels/job-numbers`,
  // One travel job's engagement details, its product/business unit and the
  // funding sources it is charged against — userMenus.ts:244-252.
  jobNumberDetails: (jobNumber: string) =>
    `${ccBackendUrl}/travels/${encodeURIComponent(jobNumber)}`,
  // GET base64 attachment / DELETE it.
  attachment: (id: number, attachmentType: string) =>
    `${ccBackendUrl}/transactions/${id}/attachments?attachmentType=${encodeURIComponent(attachmentType)}`,
  // PUT raw file bytes — note the backend's (misspelled) `fileExtenstion` query param.
  attachmentUpload: (id: number, fileExtension: string, attachmentType: string) =>
    `${ccBackendUrl}/transactions/${id}/attachments?fileExtenstion=${encodeURIComponent(fileExtension)}&attachmentType=${encodeURIComponent(attachmentType)}`,
};

// Out-of-pocket expense claims — expense-claims/backend.
export const expenseBackendUrl: string =
  window.config?.ONE_WSO2_EXPENSE_CLAIMS_BACKEND_URL ?? "";

export function isExpenseBackendConfigured(): boolean {
  return Boolean(expenseBackendUrl);
}

export const expenseServiceUrls = {
  appData: `${expenseBackendUrl}/app-data`,
  searchClaims: `${expenseBackendUrl}/search-claims`,
  claims: `${expenseBackendUrl}/claims`,
  claimDrafts: `${expenseBackendUrl}/claim-drafts`,
  claimStatus: (claimId: string) =>
    `${expenseBackendUrl}/claims/${encodeURIComponent(claimId)}/status`,
  claimTransactions: (claimId: string) =>
    `${expenseBackendUrl}/claims/${encodeURIComponent(claimId)}/transactions`,
  employees: `${expenseBackendUrl}/employees`,
  expenseTypes: (travelJobNumber?: string) =>
    `${expenseBackendUrl}/user-configurations/expense-types${
      travelJobNumber ? `?travelJobNumber=${encodeURIComponent(travelJobNumber)}` : ""
    }`,
  exchangeRates: (baseCode: string, date: string) =>
    `${expenseBackendUrl}/currencies/${encodeURIComponent(baseCode)}/rates/${encodeURIComponent(date)}`,
  receiptUpload: (email: string) =>
    `${expenseBackendUrl}/claims/${encodeURIComponent(email)}/transactions/receipts/file`,
  receiptFile: (fileName: string) =>
    `${expenseBackendUrl}/claims/transactions/receipts/file/${encodeURIComponent(fileName)}`,
};

// ---- marketing-ops backend -------------------------------------------------
//
// The Marketing Ops backend (digiops-marketing/agents/marketing-ops) is a
// Python/FastAPI service — the first non-Ballerina backend this app talks to —
// and it stays exactly as it is: this perspective is a frontend migration only.
//
// Two things differ from every sibling above, both worth knowing before adding
// an endpoint:
//
//  1. Its routes are namespaced under `/api/*`, and the Choreo proxy PRESERVES
//     that prefix, so every URL here carries it. Verified 2026-08-17 against
//     staging: `/api/me` → 200, `/me` → 404.
//  2. It authenticates purely from the gateway's `x-jwt-assertion` header and
//     never inspects the Asgardeo token itself, so the standard authedGet /
//     authedPost helpers work unmodified — no per-backend header quirk like
//     par-app's `x-user-timezone-offset`.
//
// A router with no root route 404s on its own prefix (`/api/settings` and
// `/api/events` both do) — always name the sub-path.
//
// Empty string = not configured; MarketingOpsShell renders a "not connected"
// state rather than firing broken requests.
// Trailing slashes stripped, because every builder below concatenates "/api/..."
// onto this — a configured value ending in "/" produced "//api/..." on all 52 of
// them, and whether that 404s depends on the gateway.
export const marketingOpsBackendUrl: string = (
  window.config?.ONE_WSO2_MARKETINGOPS_BACKEND_URL ?? ""
).replace(/\/+$/, "");

export function isMarketingOpsBackendConfigured(): boolean {
  return Boolean(marketingOpsBackendUrl);
}

export const marketingOpsServiceUrls = {
  // GET /api/me — identity + the authorization decision. Authenticated but
  // NOT gated: an authenticated non-member still gets a 200 with
  // `authorized: false`, which is what lets the SPA render an honest
  // "you don't have access" state instead of a bare 403.
  me: `${marketingOpsBackendUrl}/api/me`,
  // ---- settings: the admin-maintained dropdown values the utilities run on ----
  //
  // Reads return the FULL lists (including disabled values, ids and sort order).
  // Consumers filter to enabled-only themselves; the admin panels need the rest.
  //
  // Writes are PUT with the COMPLETE `{ entries: [...] }` array — a replace, not
  // a patch. That's the backend's contract and it's the right one: these are
  // ordered lists where the order is meaningful, so there's no coherent partial
  // update. It also means a stale client can't silently drop a value another
  // admin just added — it overwrites with what it last read, which the panel's
  // review-before-save dialog makes visible.
  settingsUtm: `${marketingOpsBackendUrl}/api/settings/utm`,
  settingsAssetName: `${marketingOpsBackendUrl}/api/settings/asset-name`,
  settingsUtmParameter: (parameter: string) =>
    `${marketingOpsBackendUrl}/api/settings/utm/${encodeURIComponent(parameter)}`,
  settingsAssetNameField: (assetType: string, field: string) =>
    `${marketingOpsBackendUrl}/api/settings/asset-name/${encodeURIComponent(assetType)}/${encodeURIComponent(field)}`,
  // GET /api/access-map — admin-only. Which Asgardeo group each capability
  // requires, for THIS environment. Diagnostic only: never derive a gate from
  // it client-side, because the group names carry an environment suffix
  // (`-stg`) that differs per deployment. Gate on `/api/me`.capabilities.
  accessMap: `${marketingOpsBackendUrl}/api/access-map`,
  // ---- ad campaigns → analytics ---------------------------------------------
  //
  // Note these are POSTs even though they are READS. Each `/run` endpoint takes
  // a report config in the body and computes the answer live from Google Ads /
  // LinkedIn / Salesforce; nothing is persisted and nothing changes server-side.
  // They're POSTs only because the config is too large and structured to be a
  // query string. Consumers should therefore treat them as queries (useQuery
  // with a POST queryFn), not mutations — see useAdAnalytics.
  //
  // ⚠️ `/roi/run` and `/linkedin-roi/run` can answer **HTTP 200 with
  // `status: "failed"`** and the reason in `error_message`. A 200 is not
  // sufficient to conclude success.
  adAnalyticsRoiOptions: `${marketingOpsBackendUrl}/api/ad-campaigns/analytics/roi/options`,
  adAnalyticsRoiRun: `${marketingOpsBackendUrl}/api/ad-campaigns/analytics/roi/run`,
  adAnalyticsLinkedInRoiRun: `${marketingOpsBackendUrl}/api/ad-campaigns/analytics/linkedin-roi/run`,
  adAnalyticsDashboardRun: `${marketingOpsBackendUrl}/api/ad-campaigns/analytics/dashboard/run`,

  // ---- ad campaigns → campaign tracker ---------------------------------------
  //
  // The weekly operating rhythm for every live campaign: Register/Budget Pacing
  // are live reads of Google Ads/LinkedIn (via the Marketing Entity Service)
  // plus a thin persisted overlay (the four Register override fields; manual
  // Budget Pacing rows); Weekly Log rows are fully persisted server-side. See
  // useCampaignTracker.ts for how each endpoint is used.
  campaignTrackerRegister: (platform: "google_ads" | "linkedin", includeInactive: boolean) =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/register?platform=${platform}${
      includeInactive ? "&include_inactive=true" : ""
    }`,
  campaignTrackerRegisterOverride: (campaignId: string, platform: "google_ads" | "linkedin") =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/register/${encodeURIComponent(campaignId)}?platform=${platform}`,
  campaignTrackerBudgetPacing: (platform: "google_ads" | "linkedin") =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/budget-pacing?platform=${platform}`,
  campaignTrackerBudgetPacingManual: `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/budget-pacing/manual`,
  campaignTrackerBudgetPacingManualRow: (id: string) =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/budget-pacing/manual/${encodeURIComponent(id)}`,
  campaignTrackerWeeklyLog: (days: number, includeUnlogged: boolean) =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/weekly-log?days=${days}${
      includeUnlogged ? "&include_unlogged=true" : ""
    }`,
  // Bare collection URL (no query string) — POST to create a manual entry.
  campaignTrackerWeeklyLogCreate: `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/weekly-log`,
  campaignTrackerWeeklyLogGroup: (groupId: string) =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/weekly-log/${encodeURIComponent(groupId)}`,
  campaignTrackerWeeklyLogEntries: (groupId: string) =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/weekly-log/${encodeURIComponent(groupId)}/entries`,
  campaignTrackerWeeklyLogEntry: (groupId: string, entryId: string) =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/weekly-log/${encodeURIComponent(groupId)}/entries/${encodeURIComponent(entryId)}`,
  campaignTrackerLinkedinRefresh: `${marketingOpsBackendUrl}/api/ad-campaigns/campaign-tracker/linkedin-refresh`,
  // ---- ad campaigns → BU ownership registry ----------------------------------
  //
  // Owner name/email + which BU they currently own, with full append-only
  // history. Reads are open to anyone with Ad Campaigns access; writes require
  // admin (enforced server-side — see the backend's `require_admin`).
  ownershipOwners: `${marketingOpsBackendUrl}/api/ad-campaigns/ownership/owners`,
  ownershipBuCurrent: `${marketingOpsBackendUrl}/api/ad-campaigns/ownership/bu-ownership/current`,
  ownershipBuHistory: (bu?: string) =>
    `${marketingOpsBackendUrl}/api/ad-campaigns/ownership/bu-ownership/history${bu ? `?bu=${encodeURIComponent(bu)}` : ""}`,
  ownershipBuAssign: `${marketingOpsBackendUrl}/api/ad-campaigns/ownership/bu-ownership`,

  // ---- design studio ----------------------------------------------------------
  //
  // The shared, DB-backed background-image library the Post Builder canvas editor
  // draws from. Images are uploaded once and shared across users; content is
  // immutable once uploaded (only name/description can change — see
  // designStudioBackgroundImage below), so the thumbnail/full-image GETs are safe
  // to cache forever client-side (see fetchBackgroundThumbnail/fetchBackgroundImage
  // in useDesignStudio.ts).
  //
  // Thumbnail/image return BINARY, not JSON — same reason as
  // emailWorkbenchTemplateThumbnail above: fetch as a blob with the Authorization
  // header (see @features/finance/util/financeReceipts for the established pattern).
  designStudioBackgroundImages: `${marketingOpsBackendUrl}/api/design-studio/background-images`,
  designStudioBackgroundImage: (id: string) =>
    `${marketingOpsBackendUrl}/api/design-studio/background-images/${encodeURIComponent(id)}`,
  designStudioBackgroundImageThumbnail: (id: string) =>
    `${marketingOpsBackendUrl}/api/design-studio/background-images/${encodeURIComponent(id)}/thumbnail`,
  designStudioBackgroundImageFile: (id: string) =>
    `${marketingOpsBackendUrl}/api/design-studio/background-images/${encodeURIComponent(id)}/image`,

  // ---- email workbench -------------------------------------------------------
  //
  // The template library (approved HTML + thumbnail), per-user drafts, the
  // Advanced editor's block catalog, and the Pardot send defaults.
  //
  // Two things differ from every other builder here:
  //  - `emailWorkbenchTemplateThumbnail` returns an IMAGE, not JSON. It needs the
  //    Authorization header like everything else, so it can't be an <img src>;
  //    fetch it as a blob (see fetchWithReauth in @api/http and the precedent in
  //    @features/finance/util/financeReceipts).
  //  - `emailWorkbenchStructure` is the one AI-backed endpoint in the whole
  //    Marketing Ops migration — it maps a plain-text draft onto a template's
  //    block structure. Everything else in this perspective is deterministic.
  emailWorkbenchTemplates: `${marketingOpsBackendUrl}/api/email-workbench/templates`,
  emailWorkbenchTemplate: (id: string) =>
    `${marketingOpsBackendUrl}/api/email-workbench/templates/${encodeURIComponent(id)}`,
  emailWorkbenchTemplateThumbnail: (id: string, version?: string) =>
    `${marketingOpsBackendUrl}/api/email-workbench/templates/${encodeURIComponent(id)}/thumbnail${
      version ? `?v=${encodeURIComponent(version)}` : ""
    }`,
  emailWorkbenchCategories: `${marketingOpsBackendUrl}/api/email-workbench/categories`,
  emailWorkbenchDrafts: `${marketingOpsBackendUrl}/api/email-workbench/drafts`,
  emailWorkbenchDraft: (id: string) =>
    `${marketingOpsBackendUrl}/api/email-workbench/drafts/${encodeURIComponent(id)}`,
  // Create the template in Pardot (draft → Completed).
  emailWorkbenchDraftPush: (id: string) =>
    `${marketingOpsBackendUrl}/api/email-workbench/drafts/${encodeURIComponent(id)}/push`,
  // Update an already-pushed Pardot template. 409 if the draft was never pushed.
  emailWorkbenchDraftUpdatePardot: (id: string) =>
    `${marketingOpsBackendUrl}/api/email-workbench/drafts/${encodeURIComponent(id)}/update-pardot`,
  emailWorkbenchBlocks: `${marketingOpsBackendUrl}/api/email-workbench/blocks`,
  emailWorkbenchBlock: (id: string) =>
    `${marketingOpsBackendUrl}/api/email-workbench/blocks/${encodeURIComponent(id)}`,
  emailWorkbenchSettings: `${marketingOpsBackendUrl}/api/email-workbench/settings`,
  emailWorkbenchStructure: `${marketingOpsBackendUrl}/api/email-workbench/structure`,

  // ---- events ------------------------------------------------------------------
  //
  // Note how SMALL this surface is relative to the feature. Validation, scoring,
  // deriving and every accept/reject run in the BROWSER (see events/rules/), so the
  // backend is asked for four things only: reference lists, the model's opinion on
  // values our rules couldn't resolve, storage, and the review workflow.
  //
  // `save` is a whole-payload PUT on a debounce — never on the path of an individual
  // edit. One blob per submission.
  //
  // The two export endpoints return BINARY (a CSV, or every tab zipped server-side),
  // so they need the blob path rather than authedGet — see events/lib/download.ts.
  eventsSubmissions: `${marketingOpsBackendUrl}/api/events/submissions`,
  eventsSubmission: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/submissions/${encodeURIComponent(id)}`,
  eventsSubmissionPayload: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/submissions/${encodeURIComponent(id)}/payload`,
  eventsSubmissionSuggest: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/submissions/${encodeURIComponent(id)}/suggest`,
  eventsSubmissionSubmit: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/submissions/${encodeURIComponent(id)}/submit`,
  eventsSubmissionWithdraw: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/submissions/${encodeURIComponent(id)}/withdraw`,
  eventsSubmissionComments: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/submissions/${encodeURIComponent(id)}/comments`,
  eventsEventNames: (q: string) =>
    `${marketingOpsBackendUrl}/api/events/event-names?q=${encodeURIComponent(q)}`,
  eventsReference: `${marketingOpsBackendUrl}/api/events/reference`,
  eventsFields: `${marketingOpsBackendUrl}/api/events/fields`,
  eventsFieldsForTab: (tab: string) =>
    `${marketingOpsBackendUrl}/api/events/fields/${encodeURIComponent(tab)}`,
  eventsStatuses: (includeDisabled = false) =>
    `${marketingOpsBackendUrl}/api/events/statuses${includeDisabled ? "?include_disabled=true" : ""}`,
  eventsStatus: (name: string) =>
    `${marketingOpsBackendUrl}/api/events/statuses/${encodeURIComponent(name)}`,
  eventsStatusDuplicate: (source: string) =>
    `${marketingOpsBackendUrl}/api/events/statuses/${encodeURIComponent(source)}/duplicate`,
  // ---- events: review (gated by the separate `events-review` capability) ----
  eventsReviewQueue: `${marketingOpsBackendUrl}/api/events/review/queue`,
  eventsReviewSubmission: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/review/submissions/${encodeURIComponent(id)}`,
  eventsReviewComments: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/review/submissions/${encodeURIComponent(id)}/comments`,
  eventsReviewApprove: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/review/submissions/${encodeURIComponent(id)}/approve`,
  eventsReviewReject: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/review/submissions/${encodeURIComponent(id)}/reject`,
  eventsReviewImported: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/review/submissions/${encodeURIComponent(id)}/imported`,
  eventsReviewExportTab: (id: string, tab: string) =>
    `${marketingOpsBackendUrl}/api/events/review/submissions/${encodeURIComponent(id)}/export/${encodeURIComponent(tab)}`,
  eventsReviewExportAll: (id: string) =>
    `${marketingOpsBackendUrl}/api/events/review/submissions/${encodeURIComponent(id)}/export`,

  // ---- crm-upload ----------------------------------------------------------------
  //
  // Two schedulers (leads, accounts) ingest enriched records into Salesforce through
  // the Entity Service. Everything here is either a paged list, a trigger, or the
  // resolution of one duplicate — the pipeline itself runs server side on a schedule.
  //
  // The list endpoints all take their filters as query params (page, limit, status,
  // record_type, source_system, search, batch_id, run_id, from_date), so the builders
  // take a ready-made URLSearchParams rather than enumerating a dozen optional
  // arguments each.
  crmUploadRuns: (params?: URLSearchParams) =>
    `${marketingOpsBackendUrl}/api/crm-upload/runs${query(params)}`,
  crmUploadRun: (id: string) =>
    `${marketingOpsBackendUrl}/api/crm-upload/runs/${encodeURIComponent(id)}`,
  crmUploadRecords: (params?: URLSearchParams) =>
    `${marketingOpsBackendUrl}/api/crm-upload/records${query(params)}`,
  // Deleting one ingested record. Hard delete with a required reason — it exists for
  // data-subject erasure requests, and removes the row from this platform only.
  crmUploadRecord: (recordType: "lead" | "account", id: string) =>
    `${marketingOpsBackendUrl}/api/crm-upload/records/${recordType}/${encodeURIComponent(id)}`,
  crmUploadDuplicates: (params?: URLSearchParams) =>
    `${marketingOpsBackendUrl}/api/crm-upload/duplicates${query(params)}`,
  // The Salesforce record an incoming one collided with. A separate call because it
  // reaches the Entity Service rather than this backend's own tables.
  crmUploadDuplicateExisting: (id: string) =>
    `${marketingOpsBackendUrl}/api/crm-upload/duplicates/${encodeURIComponent(id)}/existing`,
  crmUploadDuplicateResolve: (id: string) =>
    `${marketingOpsBackendUrl}/api/crm-upload/duplicates/${encodeURIComponent(id)}/resolve`,
  crmUploadTrigger: (kind: "leads" | "accounts") =>
    `${marketingOpsBackendUrl}/api/crm-upload/triggers/${kind}`,

  // The remaining operation root — /api/audit — gets its builders added by the phase
  // that ports it, so this object never lists a URL nothing calls.
};

// `?a=b` when there is anything to append, otherwise nothing — a bare trailing "?"
// is harmless but ends up in query keys and logs, and reads as a bug.
function query(params?: URLSearchParams): string {
  const s = params?.toString();
  return s ? `?${s}` : "";
}

// Base URL of the Pardot UI, for deep-linking to a template after it's pushed.
// Not an API — a link target. Defaults to Pardot's own host, which is correct for
// every WSO2 environment today; the key exists so a sandbox can point elsewhere.
//
// Trailing slashes are stripped so pardotTemplateUrl() can concatenate safely.
export const pardotBaseUrl: string = (
  window.config?.ONE_WSO2_PARDOT_BASE_URL ?? "https://pi.pardot.com"
).replace(/\/+$/, "");

export function pardotTemplateUrl(id: number | string): string {
  return `${pardotBaseUrl}/emailTemplate/read/id/${encodeURIComponent(String(id))}`;
}

// Base URL of the Salesforce Lightning UI, for deep-linking to the record an
// incoming one collided with. Not an API — a link target, opened in a new tab from
// the CRM Upload review queue.
//
// Marketing Ops read this from a build-time `VITE_SF_BASE_URL` and rendered a dead
// "#" href when it was unset. One WSO2 resolves backend URLs at runtime, so it moves
// to window.config — and it carries WSO2's own Lightning host as the default, since
// an unset key producing a link that goes nowhere is worse than one that works
// everywhere but a sandbox.
export const salesforceBaseUrl: string = (
  window.config?.ONE_WSO2_SALESFORCE_BASE_URL ?? "https://wso2.lightning.force.com"
).replace(/\/+$/, "");

export function salesforceRecordUrl(object: "Lead" | "Account", id: string): string {
  return `${salesforceBaseUrl}/lightning/r/${object}/${encodeURIComponent(id)}/view`;
}

// ISAC — a separate marketing application, not part of this webapp and not a
// Marketing Ops operation. It appears at the top of the Marketing Ops rail as an
// outbound link because that is where the people who use it look for it, not
// because One WSO2 hosts any of it.
//
// Empty string = not configured, and the rail then omits the item entirely rather
// than showing one that goes nowhere. Same contract as leaveWebAppUrl above.
export const isacUrl: string = window.config?.ONE_WSO2_MARKETINGOPS_ISAC_URL ?? "";

export function isIsacConfigured(): boolean {
  return Boolean(isacUrl);
}

// CSM — a separate application this webapp does not host. Its launcher tile
// opens it in a new tab rather than routing anywhere, which is why it needs no
// route of its own and never appears as a landing choice or a favourite: there
// is nothing here to land on.
//
// Empty string = not configured, and the tile then stays in its unbuilt state
// rather than becoming a link to nowhere.
export const csmUrl: string = window.config?.ONE_WSO2_CSM_URL ?? "";

export function isCsmConfigured(): boolean {
  return Boolean(csmUrl);
}

export const promotionServiceUrls = {
  // GET /employee-info?employeeWorkEmail=<email> — returns the caller's
  // EmployeeInfoWithLead (startDate, jobBand, lastPromotedDate, reportingLead,
  // etc.). Non-lead callers can only query their own email.
  employeeInfo: (workEmail: string) =>
    `${promotionBackendUrl}/employee-info?employeeWorkEmail=${encodeURIComponent(workEmail)}`,
  // GET /promotion/requests?statusArray=APPROVED&employeeEmail=<email> —
  // approved promotion history for the given employee. Backend authorization
  // allows self-lookup for non-admins.
  promotionHistory: (workEmail: string) =>
    `${promotionBackendUrl}/promotion/requests?statusArray=APPROVED&employeeEmail=${encodeURIComponent(workEmail)}`,
};

// ---------------------------------------------------------------------------
// Menu (cafeteria) backend. Daily menu, lunch feedback, and dinner-on-demand
// orders. The service is reused unchanged from the standalone app; see
// docs/ported-apps/menu-app.md for the contract and the behaviour it defines.
//
// Every path is fixed — no builder takes an argument, because the caller is
// always identified by the token rather than by a path segment.
export const menuBackendUrl: string = window.config?.ONE_WSO2_MENU_BACKEND_URL ?? "";

export function isMenuBackendConfigured(): boolean {
  return Boolean(menuBackendUrl);
}

export const menuServiceUrls = {
  // Employee profile + privileges. Also the source of the department / team /
  // manager email an order carries.
  userInfo: `${menuBackendUrl}/user-info`,
  // The configured lunch-feedback window. Optional in practice: the standalone
  // app never called it, so it may not be published through the gateway. A 404
  // is tolerated and the hard-coded fallback window applies.
  metaInfo: `${menuBackendUrl}/meta-info`,
  menu: `${menuBackendUrl}/menu`,
  feedback: `${menuBackendUrl}/feedback`,
  // GET the current order, POST to place or change it, DELETE to cancel.
  dinner: `${menuBackendUrl}/dinner`,
};
