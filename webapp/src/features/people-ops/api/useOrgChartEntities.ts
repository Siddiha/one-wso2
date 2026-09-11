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

// Master Data → Org Structure: reading and writing the four org-chart entity
// kinds. All four share one shape and one pair of endpoints, differing only
// in URL, so one hook family serves all of them and the screen passes a kind.
//
// Separate from useOrgMasterData despite hitting the same collection URLs,
// and deliberately so: that hook feeds the report filter dropdowns and wants
// only ACTIVE entities, normalised to {id, label}. This one manages them, so
// it asks for inactive rows too and keeps every field. Sharing a cache entry
// would have one screen's needs silently change the other's contents.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAsgardeo } from "@asgardeo/react";
import {
  authedGet,
  authedPatch,
  authedPost,
  defaultQueryRetry,
  HttpError,
} from "@api/http";
import { useAccessToken } from "@hooks/useAccessToken";
import { peopleBackendUrl, peopleServiceUrls } from "@config/apiConfig";
import { foldIdentityError, useAsgardeoSub } from "@hooks/useAsgardeoSub";
import type {
  CreateOrgChartEntityPayload,
  EmployeeBasicInfo,
  OrgChartEntity,
  OrgEntityKind,
  UpdateOrgChartEntityPayload,
} from "./peopleOpsTypes";

// Per-kind wiring: the collection URL (GET list, POST create), the per-id URL
// (PATCH), and the words the UI puts around them. One table so adding a fifth
// entity kind is a single entry rather than a new file.
interface OrgEntityConfig {
  collectionUrl: string;
  itemUrl: (id: number) => string;
  /** Singular, for dialog titles: "Add team". */
  label: string;
  /** Plural, for the tab: "Teams". */
  pluralLabel: string;
  /** The head-email field's label in the dialog, which names the entity. */
  headEmailLabel: string;
  /**
   * The head column's heading in the table. Says "head" rather than "head
   * email" because the column renders the person (avatar + name), not the
   * address — the address is the tooltip.
   */
  headColumnLabel: string;
}

export const ORG_ENTITY_CONFIG: Record<OrgEntityKind, OrgEntityConfig> = {
  businessUnit: {
    collectionUrl: peopleServiceUrls.businessUnits,
    itemUrl: peopleServiceUrls.businessUnit,
    label: "business unit",
    pluralLabel: "Business units",
    headEmailLabel: "Business unit head email",
    headColumnLabel: "Business unit head",
  },
  team: {
    collectionUrl: peopleServiceUrls.teams(),
    itemUrl: peopleServiceUrls.team,
    label: "team",
    pluralLabel: "Teams",
    headEmailLabel: "Team head email",
    headColumnLabel: "Team head",
  },
  subTeam: {
    collectionUrl: peopleServiceUrls.subTeams(),
    itemUrl: peopleServiceUrls.subTeam,
    label: "sub team",
    pluralLabel: "Sub teams",
    headEmailLabel: "Sub team head email",
    headColumnLabel: "Sub team head",
  },
  unit: {
    collectionUrl: peopleServiceUrls.units(),
    itemUrl: peopleServiceUrls.unit,
    label: "unit",
    pluralLabel: "Units",
    headEmailLabel: "Unit head email",
    headColumnLabel: "Unit head",
  },
};

export const ORG_ENTITY_KINDS: OrgEntityKind[] = [
  "businessUnit",
  "team",
  "subTeam",
  "unit",
];

function entitiesKey(kind: OrgEntityKind, userSub: string | undefined) {
  return ["people-ops", "org-chart", kind, userSub];
}

// A 403 means "you are not an admin" — settled, not transient. Retrying it
// only delays the shell's explanation.
function orgChartRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof HttpError && error.status === 403) return false;
  return defaultQueryRetry(failureCount, error);
}

// GET the full list for one kind, INCLUDING inactive entities — this screen
// manages them, so it has to be able to see and reactivate a deactivated one.
export function useOrgChartEntities(kind: OrgEntityKind, enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const { state: subState, retry: retryIdentity } = useAsgardeoSub();
  const userSub = subState.status === "ready" ? subState.sub : undefined;

  const query = useQuery<OrgChartEntity[]>({
    queryKey: entitiesKey(kind, userSub),
    enabled: enabled && isSignedIn && Boolean(peopleBackendUrl) && Boolean(userSub),
    queryFn: async () => {
      const accessToken = await getAccessToken();
      return authedGet<OrgChartEntity[]>(
        `${ORG_ENTITY_CONFIG[kind].collectionUrl}?includeInactive=true`,
        accessToken,
      );
    },
    // Short, because this screen is where the data changes. The mutations
    // below invalidate on success, so this mainly covers edits made elsewhere.
    staleTime: 60 * 1000,
    retry: orgChartRetry,
  });

  return foldIdentityError(query, subState, retryIdentity);
}

// GET /employees/basic-info — the option list for employee pickers.
//
// Returns Active and Marked-leaver employees; the backend excludes only
// fully Left ones. A Marked-leaver is still employed until their leave
// date, so appointing them as a team head is a legitimate (if temporary)
// choice, not something to filter out here.
//
// Cached for the session — the roster changes on onboarding, not while a
// dialog is open — and shared across every picker by a single query key.
export function useEmployeesBasicInfo(enabled = true) {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const { state: subState, retry: retryIdentity } = useAsgardeoSub();
  const userSub = subState.status === "ready" ? subState.sub : undefined;

  const query = useQuery<EmployeeBasicInfo[]>({
    queryKey: ["people-ops", "employees-basic-info", userSub],
    enabled: enabled && isSignedIn && Boolean(peopleBackendUrl) && Boolean(userSub),
    queryFn: async () => {
      const accessToken = await getAccessToken();
      return authedGet<EmployeeBasicInfo[]>(
        peopleServiceUrls.employeesBasicInfo,
        accessToken,
      );
    },
    staleTime: 30 * 60 * 1000,
    retry: orgChartRetry,
  });

  return foldIdentityError(query, subState, retryIdentity);
}

// Refresh everything derived from a kind after a write: this screen's own
// list, and the report filter dropdowns, which read the same entities through
// useOrgMasterData under a different key and would otherwise show a stale name
// for up to 30 minutes.
//
// This AWAITS a refetch of the visible list rather than firing an
// invalidation and moving on. The app sets `refetchOnMount: false` globally
// (see AppWithConfig), so marking data stale is not on its own enough to put
// new rows on screen — the saved edit would not appear until something else
// happened to trigger a fetch. Awaiting also means the dialog's spinner is
// still up while the table reloads, so it closes onto fresh data instead of
// flashing the old row for a moment.
//
// The filter dropdowns are a plain invalidate: they are usually not mounted,
// nobody is waiting on them, and they will refetch when next opened.
function useRefreshOrgData(kind: OrgEntityKind) {
  const qc = useQueryClient();
  return async () => {
    await qc.refetchQueries({ queryKey: ["people-ops", "org-chart", kind] });
    void qc.invalidateQueries({ queryKey: ["people-ops", "org"] });
  };
}

// POST a new entity. Returns the new id, which the backend sends as a bare
// integer rather than an object.
export function useCreateOrgChartEntity(kind: OrgEntityKind) {
  const getAccessToken = useAccessToken();
  const refresh = useRefreshOrgData(kind);

  return useMutation<number | null, Error, CreateOrgChartEntityPayload>({
    mutationFn: async (payload) => {
      const accessToken = await getAccessToken();
      return authedPost<number>(
        ORG_ENTITY_CONFIG[kind].collectionUrl,
        accessToken,
        payload,
      );
    },
    onSuccess: refresh,
  });
}

// PATCH an existing entity. Callers send only what changed.
//
// Deactivation (isActive: false) is refused with a 400 when the entity still
// has employees assigned; the message says how many. The dialog disables the
// toggle in that case, so this path is the backstop for a count that changed
// between load and save rather than the normal way anyone meets that rule.
export function useUpdateOrgChartEntity(kind: OrgEntityKind) {
  const getAccessToken = useAccessToken();
  const refresh = useRefreshOrgData(kind);

  return useMutation<
    unknown,
    Error,
    { id: number; payload: UpdateOrgChartEntityPayload }
  >({
    mutationFn: async ({ id, payload }) => {
      const accessToken = await getAccessToken();
      return authedPatch<unknown>(
        ORG_ENTITY_CONFIG[kind].itemUrl(id),
        accessToken,
        payload,
      );
    },
    onSuccess: refresh,
  });
}
