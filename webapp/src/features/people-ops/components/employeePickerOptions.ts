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

// Option-list assembly for EmployeeEmailPicker.
//
// Extracted from the component because the interesting case has no visual
// component to it: /employees/basic-info excludes fully Left employees (it
// does include Marked-leavers), but an entity may already have a head who
// has since actually left. If that stored email is not among the options,
// the Autocomplete treats the value as unmatched and clears it — so merely
// opening a dialog would blank the field, and saving anything else would
// quietly drop the head.
//
// The fix is a synthetic option carrying the stored email, marked so the UI
// can say why someone appears who is not on the roster.

import type { EmployeeBasicInfo } from "../api/peopleOpsTypes";

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** A stand-in for an email the roster doesn't contain (a former employee). */
export function syntheticOption(email: string): EmployeeBasicInfo {
  return { employeeId: "", firstName: "", lastName: "", workEmail: email.trim() };
}

/** True for a stand-in — it has an address but no person behind it. */
export function isSynthetic(option: EmployeeBasicInfo): boolean {
  return option.employeeId === "" && !option.firstName && !option.lastName;
}

/**
 * The roster, plus a stand-in for `value` when it isn't in it.
 *
 * Comparison is case-insensitive and trimmed: emails stored years ago may
 * not match the roster's casing, and a case-only mismatch would produce a
 * duplicate entry for the same person.
 */
export function buildPickerOptions(
  roster: EmployeeBasicInfo[],
  value: string,
): EmployeeBasicInfo[] {
  const current = value.trim();
  if (!current) return roster;
  const known = roster.some((e) => emailKey(e.workEmail) === emailKey(current));
  // Prepended, not appended: it is the current value, so it belongs where
  // the selected option would normally sit.
  return known ? roster : [syntheticOption(current), ...roster];
}

/** The option matching `value`, or null when nothing is selected. */
export function findSelectedOption(
  options: EmployeeBasicInfo[],
  value: string,
): EmployeeBasicInfo | null {
  const current = value.trim();
  if (!current) return null;
  return options.find((e) => emailKey(e.workEmail) === emailKey(current)) ?? null;
}
