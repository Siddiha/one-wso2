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
import { isEmptyTilHtml, sanitizeTilHtml, tilExcerpt, tilPlainTextLength } from "./tilRichText";

describe("sanitizeTilHtml", () => {
  it("keeps allowlisted formatting", () => {
    const html = "<p>Learned <strong>a lot</strong> from <em>this</em>.</p>";
    expect(sanitizeTilHtml(html)).toBe(html);
  });

  it("strips a script tag and its contents", () => {
    expect(sanitizeTilHtml('<p>hi</p><script>alert("x")</script>')).toBe("<p>hi</p>");
  });

  it("strips a disallowed attribute (onerror) but keeps the element", () => {
    const result = sanitizeTilHtml('<p onerror="alert(1)">hi</p>');
    expect(result).not.toContain("onerror");
    expect(result).toContain("hi");
  });

  it("keeps a safe link's href", () => {
    expect(sanitizeTilHtml('<a href="https://wso2.com">WSO2</a>')).toContain('href="https://wso2.com"');
  });

  it("drops a javascript: link", () => {
    expect(sanitizeTilHtml('<a href="javascript:alert(1)">bad</a>')).not.toContain("javascript:");
  });

  it("keeps an img's src and alt", () => {
    const html = '<img src="https://wso2.com/x.png" alt="a screenshot">';
    const result = sanitizeTilHtml(html);
    expect(result).toContain('src="https://wso2.com/x.png"');
    expect(result).toContain('alt="a screenshot"');
  });

  it("strips a disallowed attribute (onerror) on an img but keeps the element", () => {
    const result = sanitizeTilHtml('<img src="https://wso2.com/x.png" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
    expect(result).toContain("<img");
  });

  it("drops a javascript: img src", () => {
    expect(sanitizeTilHtml('<img src="javascript:alert(1)">')).not.toContain("javascript:");
  });

  it("drops a data: img src", () => {
    // ALLOWED_URI_REGEXP only permits http(s)/mailto/tel -- data: URIs
    // (base64-embedded images) are excluded on purpose, same reasoning as
    // the backend sanitizer: real storage via POST /uploads, not inline
    // data blowing past the length limit and bloating storage.
    expect(sanitizeTilHtml('<img src="data:image/png;base64,aGVsbG8=">')).not.toContain("data:");
  });

  it("keeps an img's width attribute", () => {
    // Backs TilRichTextField's resize overlay (S/M/L presets), which sets
    // this as a plain HTML attribute, never an inline style.
    const result = sanitizeTilHtml('<img src="https://wso2.com/x.png" width="50%">');
    expect(result).toContain('width="50%"');
  });

  it("strips an img's style attribute", () => {
    // "width" is allowed specifically because, unlike "style", it can't
    // carry CSS -- style itself must stay disallowed regardless, or the
    // resize overlay could just as easily have opened a style-based
    // injection surface instead of this one safe attribute.
    const result = sanitizeTilHtml(
      '<img src="https://wso2.com/x.png" style="position:fixed;top:0;left:0;width:100vw;height:100vh;">',
    );
    expect(result).not.toContain("style");
    expect(result).toContain("<img");
  });
});

describe("isEmptyTilHtml", () => {
  it("treats Quill's default empty markup as empty", () => {
    expect(isEmptyTilHtml("<p><br></p>")).toBe(true);
  });

  it("treats a blank string as empty", () => {
    expect(isEmptyTilHtml("")).toBe(true);
  });

  it("treats real content as not empty", () => {
    expect(isEmptyTilHtml("<p>Learned something.</p>")).toBe(false);
  });
});

describe("tilPlainTextLength", () => {
  it("counts only the text, not the markup", () => {
    expect(tilPlainTextLength("<p><strong>abc</strong></p>")).toBe(3);
  });

  it("doesn't glue adjacent paragraphs into one word", () => {
    expect(tilPlainTextLength("<p>One</p><p>Two</p>")).toBe("One Two".length);
  });
});

describe("tilExcerpt", () => {
  it("returns short content unchanged", () => {
    expect(tilExcerpt("<p>Short learning.</p>")).toBe("Short learning.");
  });

  it("truncates long content at a word boundary with an ellipsis", () => {
    const long = Array.from({ length: 10 }, (_, i) => `word${i}`).join(" ");
    const result = tilExcerpt(`<p>${long}</p>`, 20);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThan(long.length);
    expect(result).not.toMatch(/\s…$/);
  });
});
