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

// Turns a search result into the set of ancestor rows that need opening,
// without ever replacing the tree itself (the source app re-rooted the whole
// canvas around whoever you searched for, losing anything you had expanded).
//
// Synchronous: the whole directory (every employee, each with its own
// managerEmail) is already in memory once useEmployeeDirectory resolves — see
// util/buildOrgTree.ts — so there's no per-ancestor fetch left to do.

/** The minimal shape this needs from a directory record. */
export interface AncestorLookup {
  workEmail: string;
  managerEmail: string;
}

/**
 * Root..target, inclusive of both ends, walking managerEmail upward until it
 * stops resolving to someone else in `byEmail` — that's either the tree's
 * real root or a stray root (see buildOrgTree), and either way it's exactly
 * as far up as there is anything to open. Empty if the target itself isn't
 * in the directory.
 */
export function ancestorChain(targetEmail: string, byEmail: ReadonlyMap<string, AncestorLookup>): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();

  let current: string | undefined = targetEmail;
  while (current && !visited.has(current)) {
    const employee = byEmail.get(current);
    if (!employee) break;
    chain.unshift(current);
    visited.add(current);
    const manager = employee.managerEmail;
    current = manager !== current && byEmail.has(manager) ? manager : undefined;
  }
  return chain;
}
