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
import { ancestorChain, type AncestorLookup } from "./expandPathToEmployee";

// chairman -> vp -> lead -> engineer
const BY_EMAIL = new Map<string, AncestorLookup>([
  ["chairman@wso2.com", { workEmail: "chairman@wso2.com", managerEmail: "chairman@wso2.com" }],
  ["vp@wso2.com", { workEmail: "vp@wso2.com", managerEmail: "chairman@wso2.com" }],
  ["lead@wso2.com", { workEmail: "lead@wso2.com", managerEmail: "vp@wso2.com" }],
  ["engineer@wso2.com", { workEmail: "engineer@wso2.com", managerEmail: "lead@wso2.com" }],
]);

describe("ancestorChain", () => {
  it("resolves the full chain, root first, target last", () => {
    expect(ancestorChain("engineer@wso2.com", BY_EMAIL)).toEqual([
      "chairman@wso2.com",
      "vp@wso2.com",
      "lead@wso2.com",
      "engineer@wso2.com",
    ]);
  });

  it("returns a single-element chain for the root itself (self-referencing managerEmail)", () => {
    expect(ancestorChain("chairman@wso2.com", BY_EMAIL)).toEqual(["chairman@wso2.com"]);
  });

  it("returns an empty chain for someone not in the directory", () => {
    expect(ancestorChain("nobody@wso2.com", BY_EMAIL)).toEqual([]);
  });

  it("stops at a stray root whose managerEmail isn't in the directory, without erroring", () => {
    const withStray = new Map(BY_EMAIL).set("stray@wso2.com", {
      workEmail: "stray@wso2.com",
      managerEmail: "departed@wso2.com",
    });
    withStray.set("strayReport@wso2.com", { workEmail: "strayReport@wso2.com", managerEmail: "stray@wso2.com" });
    expect(ancestorChain("strayReport@wso2.com", withStray)).toEqual(["stray@wso2.com", "strayReport@wso2.com"]);
  });

  it("does not loop forever on a cyclic managerEmail chain", () => {
    const cyclic = new Map<string, AncestorLookup>([
      ["a@wso2.com", { workEmail: "a@wso2.com", managerEmail: "b@wso2.com" }],
      ["b@wso2.com", { workEmail: "b@wso2.com", managerEmail: "a@wso2.com" }],
    ]);
    const chain = ancestorChain("a@wso2.com", cyclic);
    expect(new Set(chain).size).toBe(chain.length);
  });
});
