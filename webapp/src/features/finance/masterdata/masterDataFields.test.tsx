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

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiSelectInput } from "./masterDataFields";

/** The engagement codes already on file, as the backend serves them. */
const EXISTING = ["MKT-GEN", "MKT-GEN-ROT", "RND-GEN"];

function renderField(onChange: (id: string, values: string[]) => void) {
  render(
    <MultiSelectInput
      id="engagementCodes"
      label="Engagement Codes"
      values={[]}
      options={EXISTING}
      required={false}
      onChange={onChange}
    />,
  );
  return screen.getByLabelText("Engagement Codes");
}

describe("MultiSelectInput", () => {
  it("keeps a new code typed but never confirmed with Enter", async () => {
    // The reported bug: a code that is not on the list was dropped when the
    // field lost focus, so reaching for Submit straight after typing left the
    // list empty and Submit disabled.
    const onChange = vi.fn();
    const field = renderField(onChange);

    await userEvent.type(field, "MKT-NEW-2026");
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith("engagementCodes", ["MKT-NEW-2026"]);
  });

  it("keeps a new code that reads as the start of an existing one", async () => {
    // `autoHighlight` used to pre-select the first suggestion, so Enter stored
    // MKT-GEN over the MKT the reader typed.
    const onChange = vi.fn();
    const field = renderField(onChange);

    await userEvent.type(field, "MKT{Enter}");

    expect(onChange).toHaveBeenCalledWith("engagementCodes", ["MKT"]);
  });

  it("still stores a code picked from the suggestions", async () => {
    const onChange = vi.fn();
    const field = renderField(onChange);

    await userEvent.type(field, "RND");
    await userEvent.click(await screen.findByText("RND-GEN"));

    expect(onChange).toHaveBeenCalledWith("engagementCodes", ["RND-GEN"]);
  });

  it("adds nothing when the box is left empty", async () => {
    const onChange = vi.fn();
    const field = renderField(onChange);

    await userEvent.click(field);
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
  });
});
