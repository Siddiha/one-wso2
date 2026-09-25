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

// Time handling for Echo.
//
// The backend sends start/end as a NAIVE datetime — "2026-09-14 10:30:00",
// with no zone suffix — and those instants are UTC. The standalone app read
// them by concatenating " UTC" onto the string and letting the engine parse it,
// which happens to work in V8 but is not a format the ECMAScript spec requires
// any engine to accept. We normalise to a real ISO instant instead, so the
// parse is defined rather than incidental.
//
// Everything is then rendered in the VIEWER's local zone, which is what the
// standalone app did (it used the local getters after that UTC parse) and what
// a meeting time should do — unlike the cafeteria menu, where the server's
// clock is the one that matters.

/**
 * Turn the backend's naive-UTC datetime into a Date.
 *
 * Accepts both the space-separated form the service emits today and the
 * ISO "T" form, with or without a trailing Z, so a backend that tightens its
 * serialisation later doesn't silently start producing Invalid Date.
 *
 * Returns null rather than an Invalid Date for anything unparseable — callers
 * render a placeholder, and a NaN leaking into a date field reads as a bug in
 * the row rather than in the data.
 */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Already carries a zone (Z or ±HH:MM) — trust it as given.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const iso = hasZone ? trimmed.replace(" ", "T") : `${trimmed.replace(" ", "T")}Z`;

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `dd/MM/yyyy, HH:mm` in the viewer's local zone — the format the standalone
 * app showed, kept so anyone moving between the two reads the same string.
 *
 * Built from the local getters rather than toLocaleString so the order and
 * separators are fixed rather than following the browser's locale: a grid
 * column has to line up, and en-US would render this as MM/dd.
 */
export function formatDateTime(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "—";

  const pad = (n: number): string => String(n).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

/** Split the comma-separated participant string into trimmed, non-empty emails. */
export function splitParticipants(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
