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

/**
 * `createdDate` and the approval dates arrive as `"2026-09-10 03:54:47.0"` —
 * a UTC timestamp with a space instead of a `T` and no zone marker.
 *
 * The shared `formatNice` regex-matches only the `YYYY-MM-DD` head and drops
 * the time, so it reads that as a LOCAL calendar day. The source app instead
 * does `dayjs.utc(value).local()`. The two agree for most of the day and
 * disagree by a full day for anything stamped after ~18:30 UTC — a claim filed
 * at 20:00 UTC is already tomorrow in Colombo. Since this screen sits beside
 * the source app in people's minds, it follows the source: parse as UTC, then
 * render in the viewer's zone.
 */
export function historyDate(value: string | null | undefined): string {
  const d = parseUtcTimestamp(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Same instant, with the time — for the activity timeline's stage lines. */
export function historyDateTime(value: string | null | undefined): string {
  const d = parseUtcTimestamp(value);
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Accepts both the timestamp form above and a bare `YYYY-MM-DD` (which the
 * backend uses for bill dates). A bare date has no time to misread, so it is
 * built from local fields — treating it as UTC midnight would shift it a day
 * backwards for anyone west of Greenwich.
 */
export function parseUtcTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  const date =
    hh === undefined
      ? new Date(Number(y), Number(mo) - 1, Number(d))
      : new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
