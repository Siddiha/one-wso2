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
import { changedValue, fieldLabel } from "./utils";

describe("changedValue", () => {
  it("hides the id values of the five assignee fields", () => {
    for (const field of ["assigner_id", "owner_id", "management_approver_id", "assignment_team_id", "action_owner_id"]) {
      expect(changedValue(field, '"42"')).toBe("");
    }
  });

  it("still shows the values of every other field", () => {
    expect(changedValue("risk_title", '"New title"')).toBe("New title");
    expect(changedValue("implementation_date", '"2026-10-01"')).toBe("2026-10-01");
  });
});

describe("fieldLabel", () => {
  it("names the assignee fields the way the form does", () => {
    expect(fieldLabel("assigner_id")).toBe("risk assigned to");
    expect(fieldLabel("owner_id")).toBe("risk owner");
    expect(fieldLabel("management_approver_id")).toBe("management approver");
    expect(fieldLabel("assignment_team_id")).toBe("assignment team");
    expect(fieldLabel("action_owner_id")).toBe("action owner");
  });
});
