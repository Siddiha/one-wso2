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

// Narrowing the approval queues: which claim TYPE to show, and a search that
// runs across every column at once.
//
// Both tabs already filter by employee and by claim id, and both send those to
// the backend as query parameters. These two are deliberately NOT that: they
// run over the rows already on screen, so typing is instant and neither one
// re-fetches. That is the whole point — Finance's complaint was the length of
// the list in front of them, not the cost of fetching it.

/** Which claim type the queue is narrowed to. */
export type ClaimKind = "all" | "opd" | "expense";

/** The fields a search looks at. Both claim types carry all three. */
export interface SearchableClaim {
  id: string;
  employeeEmail: string;
  totalAmount: number;
}

/** Whether a group of this type should render under the current filter. */
export function showsKind(filter: ClaimKind, kind: "opd" | "expense"): boolean {
  return filter === "all" || filter === kind;
}

/**
 * Whether a claim matches the search box.
 *
 * Matches the claim id, the claimant's email, their display name, and the
 * amount — a single box rather than one field per column, because the reader
 * knows what they are looking for but not which column it lives in.
 *
 * `nameFor` resolves an email to a display name. The row itself shows the
 * email, but Finance reads these queues by person, so "yukthi" has to find the
 * claim whether or not the directory happens to have loaded.
 *
 * `entityFor` resolves an email to that person's legal entity. Nothing on the
 * row shows it, and the Advanced Filter already narrows by it — but a reader
 * who wants "the Lanka ones" reaches for the search box first, and a box that
 * silently ignored the word would read as broken.
 *
 * An empty term matches everything, so a blank box is not a filter.
 */
export function matchesClaimSearch(
  claim: SearchableClaim,
  term: string,
  nameFor?: (email: string) => string,
  entityFor?: (email: string) => string,
): boolean {
  const query = term.trim().toLowerCase();
  if (!query) return true;

  // "13,325" and "13325" are the same search: the amount renders grouped, so
  // that is how someone reading the screen would type it back.
  const unseparated = query.replace(/,/g, "");

  const fields = [
    claim.id,
    claim.employeeEmail,
    nameFor?.(claim.employeeEmail) ?? "",
    entityFor?.(claim.employeeEmail) ?? "",
    // Both forms, so "13325" finds 13325.91 — the decimals are rarely typed.
    String(claim.totalAmount),
    String(Math.trunc(claim.totalAmount)),
  ];

  return fields.some((field) => {
    const value = String(field ?? "").toLowerCase();
    return value.includes(query) || (unseparated !== query && value.includes(unseparated));
  });
}

export interface ClaimApprovalDraftFilters {
  /** Claimant's email, or null for everyone. A backend query parameter. */
  employee: string | null;
  /** Claim id to look up. A backend query parameter. */
  claimId: string;
  /** Which claim type to show. Narrows rows already fetched. */
  kind: ClaimKind;
  /** Subsidiary CODE to show, or "" for every entity. The code, not the legal
   *  name: two subsidiaries can share one legal name (WSO2 - UK and
   *  WSO2 - SPAIN are both "WSO2 (UK) LIMITED"), so a name would merge two
   *  different entities into one choice. Narrows rows already fetched. */
  entityCode: string;
}

export const EMPTY_CLAIM_FILTERS: ClaimApprovalDraftFilters = {
  employee: null,
  claimId: "",
  kind: "all",
  entityCode: "",
};

/** Whether anything in a set of filters is actually narrowing the queue. */
export function hasActiveClaimFilters(filters: ClaimApprovalDraftFilters): boolean {
  return (
    Boolean(filters.employee) ||
    filters.claimId.trim() !== "" ||
    filters.kind !== "all" ||
    filters.entityCode !== ""
  );
}

/** One selectable legal entity: the code that is filtered on, and the name shown. */
export interface ClaimEntityOption {
  code: string;
  label: string;
}

/**
 * The entity dropdown's options, built from the subsidiaries master data but
 * narrowed to the entities the people in these queues actually belong to —
 * offering all 31 rows, most of them test data or dormant, would bury the dozen
 * that can match anything.
 *
 * Keyed on code throughout. Two subsidiaries can carry the same legal name, so
 * the label disambiguates with the country where one is shared, and a code the
 * master data has no row for still gets an option rather than vanishing.
 *
 * + companyCodes - The distinct `company` values seen on the employees in view
 * + subsidiaries - Subsidiary master data
 * + return - Options sorted by label
 */
export function buildEntityOptions(
  companyCodes: Iterable<string>,
  subsidiaries: { code: string; legalName: string; country: string }[] | undefined,
): ClaimEntityOption[] {
  const byCode = new Map((subsidiaries ?? []).map((s) => [s.code, s]));
  // A legal name shared by more than one subsidiary has to say which is which.
  const nameCounts = new Map<string, number>();
  for (const s of subsidiaries ?? []) {
    nameCounts.set(s.legalName, (nameCounts.get(s.legalName) ?? 0) + 1);
  }

  const options: ClaimEntityOption[] = [];
  for (const code of new Set(companyCodes)) {
    if (!code) continue;
    const match = byCode.get(code);
    if (!match) {
      // The HRIS knows a company the master data has no subsidiary for — real
      // in this data (WSO2 - SG, WSO2 - SOUTH AFRICA). Still filterable, shown
      // by its code so nobody's claims become unreachable.
      options.push({ code, label: code });
      continue;
    }
    const shared = (nameCounts.get(match.legalName) ?? 0) > 1;
    options.push({
      code,
      label: shared && match.country ? `${match.legalName} (${match.country})` : match.legalName,
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}
