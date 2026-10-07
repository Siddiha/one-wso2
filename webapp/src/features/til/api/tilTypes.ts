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

// Wire and domain types for the til-backend service.
//
// The backend is the only writer of `submittedByEmail` — it reads it from the
// caller's id_token, never from the request body, so a submission can never be
// attributed to someone other than whoever authenticated the call. `who` is a
// separate, human-readable byline (the submitter's own name, e.g. "Jane Doe,
// Customer Success Engineer"), pre-filled by the form from the caller's own
// signed-in identity rather than freely typed; it is NOT the identity check.
// Keeping both means a submission can never be anonymous (submittedByEmail is
// always real) while still letting people describe themselves naturally.

export const TIL_WHERE_OPTIONS = ["Customer", "Partner", "Internal", "Other"] as const;
export type TilWhere = (typeof TIL_WHERE_OPTIONS)[number];

export function isTilWhere(value: string): value is TilWhere {
  return (TIL_WHERE_OPTIONS as readonly string[]).includes(value);
}

export const TIL_WHAT_MAX_LENGTH = 5000;
export const TIL_TITLE_MAX_LENGTH = 50;
export const TIL_WHERE_DETAIL_MAX_LENGTH = 200;
export const TIL_WHO_MAX_LENGTH = 200;

// --- wire --------------------------------------------------------------

export interface TilUserInfoWire {
  email: string;
  displayName: string;
  /** Whether this caller may delete other people's submissions. */
  canModerate: boolean;
}

export interface TilSubmissionWire {
  id: string;
  title: string;
  who: string;
  where: TilWhere;
  /** The customer/partner's name — present when `where` is "Customer" or "Partner". */
  whereDetail: string | null;
  what: string;
  submittedByEmail: string;
  createdAt: string; // ISO 8601
}

export interface TilSubmissionsPageWire {
  items: TilSubmissionWire[];
  /** Opaque cursor for the next page, or null when this is the last page. */
  nextCursor: string | null;
}

// --- domain --------------------------------------------------------------

export interface TilSubmission {
  id: string;
  title: string;
  who: string;
  where: TilWhere;
  whereDetail: string | null;
  what: string;
  submittedByEmail: string;
  /** Parsed once here so components never touch `Date` directly (see conventions.md, Time). */
  createdAt: Date;
}

export interface TilSubmissionPayload {
  title: string;
  who: string;
  where: TilWhere;
  /** Required by the backend when `where` is "Customer" or "Partner", omitted otherwise. */
  whereDetail?: string;
  what: string;
}

export function normalizeSubmission(wire: TilSubmissionWire): TilSubmission {
  return { ...wire, createdAt: new Date(wire.createdAt) };
}

/** One match from GET /customers/search (entity-service's Account, proxied
 * through til-backend). `id` exists for a future "link this entry to a real
 * account" use, but the form today only ever submits `name` as whereDetail —
 * entity-service's AccountView has far more fields than this; only what the
 * autocomplete needs is carried over. */
export interface TilCustomerOption {
  id: string;
  name: string;
}
