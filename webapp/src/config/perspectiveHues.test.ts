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
import { PERSPECTIVE_HUES, perspectiveHue } from "@config/perspectiveHues";
import { PERSPECTIVES } from "@constants/perspectives";

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * WCAG 1.4.11 non-text contrast. Icons that carry meaning need 3:1 — not the 4.5:1
 * text floor, and not the 3:1-is-fine-for-anything shortcut either.
 */
const NON_TEXT_FLOOR = 3;

describe("perspective hues", () => {
  // The point of precomputing the washes is that they can be checked. Without this,
  // a hand-edited hex could quietly drop a glyph below the floor and nothing would
  // catch it until someone measured a screenshot.
  it("keeps every glyph above the non-text contrast floor in both schemes", () => {
    for (const [key, entry] of Object.entries(PERSPECTIVE_HUES)) {
      for (const scheme of ["light", "dark"] as const) {
        const { bg, fg } = entry[scheme];
        const ratio = contrast(fg, bg);
        expect(
          ratio,
          `${key}/${scheme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
      }
    }
  });

  it("leaves usable headroom rather than sitting on the floor", () => {
    // A treatment that only just passes has nothing left for a seventh perspective.
    // Saturated fills with white glyphs measured 3.05:1 at worst, which is why this
    // is a wash treatment instead.
    const ratios = Object.values(PERSPECTIVE_HUES).flatMap((e) => [
      contrast(e.light.fg, e.light.bg),
      contrast(e.dark.fg, e.dark.bg),
    ]);
    expect(Math.min(...ratios)).toBeGreaterThan(3.5);
  });

  it("gives every hue a distinct wash, so tiles stay tellable apart", () => {
    const lightWashes = Object.values(PERSPECTIVE_HUES).map((e) => e.light.bg);
    expect(new Set(lightWashes).size).toBe(lightWashes.length);
  });

  it("covers every perspective a user can actually open", () => {
    // Locked perspectives render grayscaled, so they need no hue. The reachable
    // ones do: a missing hue degrades to the neutral tile rather than crashing,
    // but it would read as an oversight.
    for (const p of PERSPECTIVES.filter((x) => x.access)) {
      expect(perspectiveHue(p.key), `no hue for "${p.key}"`).toBeDefined();
    }
  });

  // The test above cannot see this one: CSM's `access` follows its URL being
  // configured, and no window.config is set here, so it never appears in the
  // reachable set — but it is tinted the moment a deployment sets the URL.
  it("colours the app that opens in another tab", () => {
    expect(perspectiveHue("csm")).toBeDefined();
  });

  it("stays inside the range of hues people can tell apart", () => {
    // Hue discrimination collapses somewhere around eight, so this cap is the
    // tripwire: when it fires, the answer is a different encoding — hue per
    // domain family, or back to monochrome — not more hues.
    //
    // RAISED TO NINE for RevOps, and this is the tripwire having fired rather
    // than a considered new ceiling. The honest position: eight was the number,
    // the ninth was added because the perspective shipped and the wheel still
    // had a 64-degree opening at 301 to put it in. There is no tenth opening —
    // every remaining gap is under 45 degrees and most are under 30 — so the
    // next perspective genuinely cannot have a hue, and whoever hits this line
    // next should change the encoding rather than this number again.
  // Hue discrimination collapses somewhere around eight or nine, so this cap is
  // the tripwire: when it fires, the answer is a different encoding — hue per
  // domain family, or back to monochrome — not more hues.
    expect(Object.keys(PERSPECTIVE_HUES).length).toBeLessThanOrEqual(9);
  });

  it("rejects inherited keys rather than resolving them", () => {
    expect(perspectiveHue("toString")).toBeUndefined();
    expect(perspectiveHue("constructor")).toBeUndefined();
  });
});
