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
 * One identity colour per perspective, for the app launcher.
 *
 * Why colour at all: the launcher is scanned, not read. Six tiles that differ only
 * by glyph and label force you to read each one; a stable hue per perspective makes
 * finding one pre-attentive. Six is also about the ceiling — past eight or ten,
 * hue discrimination collapses and you are back to reading labels.
 *
 * Scope is deliberately the launcher alone. The rail already signals "you are here"
 * with selection state, so a hue there would compete with a signal that works;
 * the launcher is the one surface with nothing else doing that job.
 *
 * SIZING, and the constraint that will eventually break this: the registry holds
 * nine perspective hues. Infra is the ninth, kept as its own teal so the launcher
 * tile stays distinct from UMT. Hue discrimination collapses somewhere past that,
 * and each new perspective wants one — at which point the answer is a different
 * encoding (hue per domain family, or back to monochrome), not a longer list.
 * perspectiveHues.test.ts caps the palette at nine so that decision is forced
 * rather than drifted into.
 *
 * TREATMENT: the glyph is the hue's dark shade on a wash of the same hue — not a
 * saturated fill with a white glyph. White-on-hue measures 3.05–3.99:1 across these,
 * which passes WCAG 1.4.11 (3:1 for meaningful icons) with nothing left over
 * for another perspective. The washes below measure 4.53–5.37:1 in light and
 * 3.83–5.01:1 in dark — both comfortably clear of the floor. Those figures are
 * asserted, not annotated: the test recomputes them from these hexes.
 *
 * The dark values are counter-intuitive and worth not "fixing": in dark mode the
 * glyph is the hue *itself*, so a stronger wash moves field and glyph together and
 * closes the gap. Dark therefore uses a weaker wash (12%) than light (14%).
 *
 * Values are precomputed rather than composited at runtime so they can be read,
 * reviewed, and asserted — see perspectiveHues.test.ts, which fails if any pair
 * drops below the 3:1 floor.
 *
 * OPEN: seven of these eight are not brand colours. The WSO2 brand system defines one
 * accent, so a palette this wide needs a brand-owner ruling — the same conversation
 * as the 180x72px logo minimum and the contained-button contrast. Until then this is
 * launcher-local and easy to withdraw.
 */
export interface PerspectiveTint {
  /** Wash behind the glyph. */
  bg: string;
  /** The glyph itself. */
  fg: string;
}

export interface PerspectiveHue {
  /** The identity hue at full saturation. Not painted directly — see the note above. */
  hue: string;
  light: PerspectiveTint;
  dark: PerspectiveTint;
}

/**
 * Keyed by `PerspectiveDef.key`. A perspective with no entry falls back to the
 * neutral treatment, so adding a perspective can't break the launcher — it just
 * renders uncoloured until a hue is chosen for it.
 */
export const PERSPECTIVE_HUES: Record<string, PerspectiveHue> = {
  // Brand orange stays with Me. That only works because selection no longer uses
  // orange (see WaffleOverlay): an orange ring around an orange tile measures
  // 3.00:1, exactly at the floor, and reads as nothing.
  me: {
    hue: "#F14E23",
    light: { bg: "#FDE6E0", fg: "#B93816" },
    dark: { bg: "#2C2124", fg: "#F14E23" },
  },
  people: {
    hue: "#2E8FE0",
    light: { bg: "#E2EFFB", fg: "#1A6BB8" },
    dark: { bg: "#1E2530", fg: "#2E8FE0" },
  },
  finance: {
    hue: "#22A37D",
    light: { bg: "#E0F2ED", fg: "#1C7A5E" },
    dark: { bg: "#1B2726", fg: "#22A37D" },
  },
  marketing: {
    hue: "#E04A8F",
    light: { bg: "#FBE6EF", fg: "#B02E6B" },
    dark: { bg: "#2C212A", fg: "#E04A8F" },
  },
  // Violet, chosen for separation rather than taste: 61 degrees from its nearest
  // neighbour on the wheel (people, at 207) where a 37-degree candidate could
  // not be told apart from it. Tints computed against the same contrast formula
  // the test uses — 5.07:1 light, 3.91:1 dark, both clear of the 3.5 headroom
  // rule with the wash treatment.
  csm: {
    hue: "#9B5DE0",
    light: { bg: "#F1E8FB", fg: "#7C4AB3" },
    dark: { bg: "#241D2C", fg: "#9B5DE0" },
  },
  // Teal, placed between Finance's green (162°) and People's sky blue (207°).
  // At 185° it stays 23° from Finance and 22° from People, wider than the
  // palette's tightest existing pair. The tints measure 5.20:1 in light mode
  // and 4.59:1 in dark mode, both above the 3.5:1 headroom target.
  infra: {
    hue: "#0E9AA7",
    light: { bg: "#DFF5F7", fg: "#0A6F79" },
    dark: { bg: "#1A2628", fg: "#0E9AA7" },
  },
  // Indigo — distinct from both people's sky blue (207°) and csm's violet
  // (268°) by sitting at 225°, between them but far enough from each to read
  // as its own colour rather than a shade of either. Tints computed against
  // the same contrast formula the test uses — 4.92:1 light, 4.30:1 dark, both
  // inside the 3.5 headroom rule with the wash treatment.
  // Gold, and the last hue this palette should gain casually. Chosen for the gap
  // rather than the association: the six before it sit at 13, 162, 207, 225, 268
  // and 332 degrees, leaving 13-162 as the only wide opening, and 43 degrees puts
  // it 30 from Me's orange — wider than the tightest existing pair (People at 207
  // and Legal at 225, 18 apart). It reads as audit/caution, which suits the
  // subject, but that is a bonus rather than the reason.
  //
  // Together with UMT below, this takes the palette to eight hues before Infra.
  // Infra is the ninth, and the next perspective should force a different encoding.
  security: {
    hue: "#B8860B",
    light: { bg: "#F9EFD7", fg: "#7E5C07" },
    dark: { bg: "#282420", fg: "#B8860B" },
  },
  legal: {
    hue: "#6C89E0",
    light: { bg: "#CFD8F3", fg: "#3854A8" },
    dark: { bg: "#262A34", fg: "#6C89E0" },
  },

  // Leaf green puts UMT between Security's gold and Finance's teal without
  // crowding either: its 84-degree hue is 41 degrees from Security and 78 from
  // Finance. The wash/foreground pairs retain the same contrast headroom
  // asserted for every launcher tile below.
  umt: {
    hue: "#5F8F1F",
    light: { bg: "#EFF6E6", fg: "#426A16" },
    dark: { bg: "#20281A", fg: "#8ABF42" },
  },

  // RevOps. Orchid at 301 degrees, and the ninth hue — see the cap note in
  // perspectiveHues.test.ts for why a ninth exists at all.
  //
  // It is NOT the green it was originally given (#678F3D, 89 degrees). Upstream
  // added umt at 85.7 degrees while this was in flight, putting the two 3.6
  // degrees apart: the same green twice, and neither findable by colour. The
  // wheel's two remaining openings were 124 (between umt and finance) and 301
  // (between csm and marketing). 124 is wider — 38 degrees of clearance against
  // 32 — but it is a third green in a palette that already has umt's olive and
  // finance's teal, so the extra degrees buy nothing a user can act on. 301 is
  // 32.6 from csm and 31.4 from marketing, both comfortably past the palette's
  // existing tightest pair (people and legal, 17.7 apart).
  //
  // Saturation and lightness deliberately copy csm's (0.68/0.58): this sits in
  // the same violet-pink quadrant, so matching its weight keeps it reading as a
  // sibling rather than a louder cousin. Measured 4.49:1 light and 4.29:1 dark.
  revops: {
    hue: "#DD4BDA",
    light: { bg: "#FAE6FA", fg: "#AC3BAA" },
    dark: { bg: "#352135", fg: "#DD4BDA" },
  },
};

export function perspectiveHue(key: string): PerspectiveHue | undefined {
  return Object.prototype.hasOwnProperty.call(PERSPECTIVE_HUES, key)
    ? PERSPECTIVE_HUES[key]
    : undefined;
}
