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

import DOMPurify from "dompurify";

// Everything to do with the "What did you learn?" rich-text field: the HTML
// sanitizing every value goes through whether it's being edited or read
// back, and the plain-text helpers that let the 5000-char limit and the
// "is this actually empty" check reason about content, not markup. Mirrors
// promotion's own promotionRichText.ts (same library, same allowlist); kept
// as its own copy rather than a shared import because PAR's and Promotion's
// equivalents are already separate per-feature copies, not one shared util.

// Sanitized on both write and read: `what` is written by one employee and
// read by every OTHER employee who opens the feed, so the read side never
// trusts that the editor sanitized it either.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "ol", "ul", "li", "a", "img"],
  ALLOWED_ATTR: ["href", "target", "src", "alt"],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

// DOMPurify special-cases img/video/audio/source src to allow a data: URI
// REGARDLESS of ALLOWED_URI_REGEXP above (long-documented DOMPurify
// behavior -- confirmed directly: the regex alone does not block it).
// Stripped as a second pass for the same reason the backend's own
// sanitizer never allows it either -- real storage via POST /uploads, not
// an inline blob that could blow past WHAT_MAX_LENGTH and bloat storage.
const _DATA_URI_IMG_RE = /<img\b[^>]*\bsrc="data:[^"]*"[^>]*>/gi;

export function sanitizeTilHtml(html: string): string {
  const cleaned = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  return cleaned.replace(_DATA_URI_IMG_RE, "");
}

// Converts to plain text for the two things that must count characters, not
// markup: the 0/5000 counter and the max-length check. Block-level tags
// become a space first so "<p>One</p><p>Two</p>" doesn't read as "OneTwo".
export function tilPlainText(html: string): string {
  // DOMParser round-trip decodes every HTML entity (&amp;, &lt;, &gt;, …),
  // not just &nbsp; -- a manual replace list only ever covers what's been
  // noticed, and Quill emits &amp;/&lt;/&gt; for plain "&"/"<"/">" in the
  // original text, same as any other HTML serializer. Without this, a
  // search for "R&D" never matches an entry that actually says "R&D" (its
  // plain text would still read "R&amp;D"), and excerpts show raw entities
  // instead of the character. Block tags become a space FIRST, same as
  // before, so adjacent paragraphs don't glue into one word -- but matching
  // "<br ...>" directly rather than only "</br>" (closing-tag form), since
  // <br> is a void element and real markup essentially never actually
  // closes it.
  const spaced = html.replace(/<\/(p|li)>|<br\s*\/?>/gi, " ");
  const text = new DOMParser().parseFromString(spaced, "text/html").body.textContent ?? "";
  return text.replace(/\u00a0/g, " ").trim();
}

export function tilPlainTextLength(html: string): number {
  return tilPlainText(html).length;
}

/** A Quill editor with nothing typed still returns markup (`<p><br></p>`,
 * not `""`), so `.trim() === ""` on the raw HTML never catches an empty
 * entry — check the plain-text content instead. */
export function isEmptyTilHtml(html: string): boolean {
  return tilPlainText(html) === "";
}

// Raised from 180 (~1 line at the feed card's width) to give a real 2-3
// line preview instead of a single truncated line -- SubmissionCard clamps
// the rendered text to 3 lines via CSS regardless, so this just controls
// how much text is available to fill them.
const EXCERPT_LENGTH = 480;

/** A plain-text preview for the feed list — formatting (bold, lists) is
 * what's lost in a one-line excerpt anyway, so this trims at a word
 * boundary near EXCERPT_LENGTH rather than mid-word, and only appends "…"
 * when something was actually cut. The full rich version still shows on
 * the entry's own page. */
export function tilExcerpt(html: string, maxLength: number = EXCERPT_LENGTH): string {
  const text = tilPlainText(html);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}
