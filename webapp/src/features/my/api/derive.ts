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

import type {
  Employee,
  EmployeePersonalInfo,
  PromotionHistoryEntry,
  UserInfo,
} from "./types";

// Small helpers for turning wire-format DTOs into what the profile UI
// actually renders. Kept next to the types so field-format quirks live in
// one place instead of being sprinkled across components.

export const DASH = "—";

export function display(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s.length === 0 ? DASH : s;
}

export function fullName(u: Pick<UserInfo | Employee, "firstName" | "lastName">): string {
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || DASH;
}

export function initialsOf(u: Pick<UserInfo | Employee, "firstName" | "lastName">): string {
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "?";
}

// Parse a YYYY-MM-DD (or ISO datetime prefixed with YYYY-MM-DD) into its
// numeric components. Avoids `new Date("YYYY-MM-DD")`, which the spec
// requires to be parsed as UTC midnight — that shifts by a full day in
// negative TZ offsets, miscomputing month/birthday boundaries. Returns
// null if the input is missing or doesn't start with a well-formed date.
function parseDateOnly(v: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!v) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m: m - 1, d }; // m is 0-indexed to match Date.getMonth()
}

// "5y 4m" style — same shape people-app renders for length of service.
// `now` is a param so tests can fix "today"; it falls back to the real one.
//
// Service stops on the employee's last day. Without `endDate` a leaver's
// tenure keeps growing after they have gone, so the same finished employment
// reports a different figure every time the page is opened — someone who left
// in 2019 reading as "8y 1m" in 2026.
//
// `endDate` is the final day of employment, and is ignored when absent or
// unparseable, which is the correct behaviour for a current employee.
export function serviceLength(
  startDate: string | null | undefined,
  now: Date = new Date(),
  endDate?: string | null,
): string {
  const start = parseDateOnly(startDate);
  if (!start) return DASH;

  // Local midnight, matching parseDateOnly's own components — constructing
  // from parts avoids the UTC shift that Date("YYYY-MM-DD") would introduce.
  //
  // Round-tripped because parseDateOnly only range-checks (d <= 31), so a
  // date like 2026-02-31 survives it and Date silently rolls it to 3 March —
  // capping tenure on a day that does not exist. A failed round-trip falls
  // back to `now`, same as any other unusable end date.
  const finalDay = parseDateOnly(endDate);
  let asOf = now;
  if (finalDay) {
    const candidate = new Date(finalDay.y, finalDay.m, finalDay.d);
    if (
      candidate.getFullYear() === finalDay.y &&
      candidate.getMonth() === finalDay.m &&
      candidate.getDate() === finalDay.d
    ) {
      asOf = candidate;
    }
  }

  let years = asOf.getFullYear() - start.y;
  let months = asOf.getMonth() - start.m;
  if (asOf.getDate() < start.d) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  // Also covers a final day earlier than the start date — bad data reads as
  // the placeholder rather than a negative tenure.
  if (years < 0) return DASH;

  // Drop the zero year: "0y 8m" reads like a formatting artifact, and under
  // a year the year is not information anyone needs. Same reasoning for a
  // whole number of years — "3y 0m" is just "3y".
  if (years === 0 && months === 0) return "< 1m";
  if (years === 0) return `${months}m`;
  if (months === 0) return `${years}y`;
  return `${years}y ${months}m`;
}

export function ageFromDob(dob: string | null | undefined, now: Date = new Date()): string {
  const b = parseDateOnly(dob);
  if (!b) return DASH;
  let age = now.getFullYear() - b.y;
  const m = now.getMonth() - b.m;
  if (m < 0 || (m === 0 && now.getDate() < b.d)) age -= 1;
  return age >= 0 ? String(age) : DASH;
}

// people-app renders dates as ISO YYYY-MM-DD from the backend, so we just
// pass them through and trim any trailing time component.
export function formatDate(v: string | null | undefined): string {
  if (!v) return DASH;
  return v.length > 10 ? v.slice(0, 10) : v;
}

// Approved promotion requests, newest first. Job band only ever moves up,
// so `nextJobBand` — not a timestamp — is what orders a promotion history:
// the highest band an employee reached is by definition their latest
// promotion. `updatedOn` would be the obvious sort key but it tracks the
// last edit to the row, so an admin correcting a 2021 record would drag it
// to the top of the list.
//
// `id` breaks ties descending, keeping the order stable if two approved
// rows ever share a band.
export function sortPromotionsByBand(
  list: PromotionHistoryEntry[],
): PromotionHistoryEntry[] {
  return [...list].sort((a, b) => {
    if (b.nextJobBand !== a.nextJobBand) return b.nextJobBand - a.nextJobBand;
    return b.id - a.id;
  });
}

// The single most recent promotion, or null when nothing is approved yet.
export function latestPromotion(
  list: PromotionHistoryEntry[] | undefined,
): PromotionHistoryEntry | null {
  if (!list || list.length === 0) return null;
  return sortPromotionsByBand(list)[0];
}

// One-line summary for the profile card: cycle plus the band jump, e.g.
// "2023-H2 · JB 5 → 6". Deliberately not a date — /promotion/requests
// exposes only createdOn/updatedOn, neither of which is the date the
// promotion took effect, so naming the cycle states what the backend
// actually knows. See docs note in PromotionHistoryDialog for the
// promotedDate field that would let this show a real date.
export function promotionSummary(entry: PromotionHistoryEntry): string {
  return `${entry.promotionCycle} · JB ${entry.currentJobBand} \u2192 ${entry.nextJobBand}`;
}

// Not every UI surface needs the whole EmployeePersonalInfo. This picks
// only the fields the emergency-contacts sub-grid renders.
export function emergencyContactList(p: EmployeePersonalInfo | undefined) {
  return p?.emergencyContacts ?? [];
}
