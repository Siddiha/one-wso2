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

import { useEffect, useRef, useState } from "react";

export type DraftState = "idle" | "saving" | "saved" | "error";

// Debounced draft autosave. `signature` is a stable string derived from the
// current line items; whenever it changes (after the first "ready" snapshot)
// the hook waits `delay` ms then runs `run` — which the caller wires to
// POST or DELETE /claim-drafts depending on whether any items remain.
//
// The first snapshot taken once `ready` is skipped so seeding the list from
// an existing server draft doesn't immediately re-save an identical draft.
// `initialBaseline` names that persisted state up front instead, for a caller
// that holds `ready` back while something resolves: the first ready snapshot
// is then compared rather than skipped, so an edit made during the wait is
// still saved.
export function useDraftAutosave(
  signature: string,
  ready: boolean,
  run: () => Promise<void>,
  delay = 1000,
  initialBaseline?: string,
): DraftState {
  // baseline = last persisted signature. State rather than a ref because the
  // returned chip is derived from it during render, and reading a ref while
  // rendering is what react-hooks/refs forbids.
  const [baseline, setBaseline] = useState<string | null>(initialBaseline ?? null);
  // The result of the last completed save, tied to the signature it saved, so
  // it is dropped as soon as the list moves on. Only ever set from the
  // promise's callbacks, never synchronously inside an effect.
  const [outcome, setOutcome] = useState<{ signature: string; state: "saved" | "error" } | null>(
    null,
  );

  // First value seen while ready = the hydrated/seeded state; adopt it as the
  // baseline so it is not saved straight back. Done during render — React's
  // documented way to adjust state when inputs change — rather than in an
  // effect, which would be a synchronous setState in an effect body.
  if (ready && baseline === null) {
    setBaseline(signature);
  }

  const runRef = useRef(run);
  // Synced in an effect, not during render: a ref write while rendering is
  // what react-hooks/refs forbids. Declared BEFORE the save effect so React
  // runs it first on every commit, which means the save below reads the
  // closure from the render that changed the signature — the one holding the
  // edited items. No dep array: `run` is a new closure each render.
  useEffect(() => {
    runRef.current = run;
  });

  // Holds a queued (debounced-but-not-yet-run) save so it can be flushed on
  // unmount instead of silently dropped.
  const pendingRef = useRef<null | (() => Promise<void>)>(null);

  // Everything the caller sees follows from these two, so no effect has to
  // push a state change to keep the chip in step.
  const dirty = ready && baseline !== null && signature !== baseline;
  const state: DraftState =
    outcome?.signature === signature ? outcome.state : dirty ? "saving" : "idle";

  useEffect(() => {
    if (!dirty) {
      // Reverted to the last-saved state: drop the queued save so leaving the
      // page does not write back a change that was undone.
      pendingRef.current = null;
      return;
    }
    const target = signature;
    const fn = runRef.current;
    pendingRef.current = fn;
    const timer = window.setTimeout(() => {
      pendingRef.current = null;
      fn()
        .then(() => {
          setBaseline(target);
          setOutcome({ signature: target, state: "saved" });
        })
        .catch(() => setOutcome({ signature: target, state: "error" }));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [dirty, signature, delay]);

  // Flush a still-queued save when the component unmounts, so leaving within
  // the debounce window doesn't drop the last edit.
  useEffect(
    () => () => {
      const fn = pendingRef.current;
      if (fn) {
        pendingRef.current = null;
        void fn().catch(() => {});
      }
    },
    [],
  );

  return state;
}
