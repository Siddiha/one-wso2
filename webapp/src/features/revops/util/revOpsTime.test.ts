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

import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  parseUtc,
  splitParticipants,
} from "./revOpsTime";

describe("parseUtc", () => {
  it("reads the backend's naive datetime as UTC, not as local time", () => {
    // The whole point of the module: without the Z this would be parsed as a
    // local wall-clock time and every row would be wrong by the zone offset.
    expect(parseUtc("2026-09-14 10:30:00")?.toISOString()).toBe("2026-09-14T10:30:00.000Z");
  });

  it("accepts the ISO T form the service may switch to", () => {
    expect(parseUtc("2026-09-14T10:30:00")?.toISOString()).toBe("2026-09-14T10:30:00.000Z");
  });

  it("does not double-apply a zone that is already present", () => {
    expect(parseUtc("2026-09-14T10:30:00Z")?.toISOString()).toBe("2026-09-14T10:30:00.000Z");
    expect(parseUtc("2026-09-14T16:00:00+05:30")?.toISOString()).toBe("2026-09-14T10:30:00.000Z");
  });

  it("returns null for absent or unparseable values rather than an Invalid Date", () => {
    expect(parseUtc(null)).toBeNull();
    expect(parseUtc(undefined)).toBeNull();
    expect(parseUtc("")).toBeNull();
    expect(parseUtc("   ")).toBeNull();
    expect(parseUtc("not a date")).toBeNull();
  });
});

describe("formatDateTime", () => {
  it("renders dd/MM/yyyy, HH:mm in the viewer's local zone", () => {
    const value = "2026-09-14 10:30:00";
    const local = new Date("2026-09-14T10:30:00Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected =
      `${pad(local.getDate())}/${pad(local.getMonth() + 1)}/${local.getFullYear()}, ` +
      `${pad(local.getHours())}:${pad(local.getMinutes())}`;
    expect(formatDateTime(value)).toBe(expected);
  });

  it("uses day-first order regardless of the runtime locale", () => {
    // 2026-01-02 is the classic ambiguous date: day-first renders 02/01.
    const out = formatDateTime("2026-01-02T00:00:00Z");
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  });

  it("shows a placeholder rather than Invalid Date", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("nonsense")).toBe("—");
  });
});

describe("splitParticipants", () => {
  it("splits, trims and drops empties", () => {
    expect(splitParticipants("a@wso2.com, b@wso2.com ,, c@wso2.com")).toEqual([
      "a@wso2.com",
      "b@wso2.com",
      "c@wso2.com",
    ]);
  });

  it("treats absent and empty as no participants", () => {
    expect(splitParticipants(null)).toEqual([]);
    expect(splitParticipants(undefined)).toEqual([]);
    expect(splitParticipants("")).toEqual([]);
  });
});
