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

import { Alert, Box, Skeleton, Typography } from "@wso2/oxygen-ui";
import { HttpError } from "@api/http";
import { useSmartNotes } from "../api/useRevOpsData";
import { describeError } from "../util/revOpsError";

/**
 * Gemini's notes for the call.
 *
 * Plain text, deliberately. Meet writes these as a Google Doc, and the export could have
 * been HTML — but pasting a Google-generated document into this layout means inheriting its
 * styles and sanitising its markup, to gain bullet glyphs. `white-space: pre-wrap` keeps
 * the line breaks and indentation that carry the structure, which is the part that matters.
 */
export default function SmartNotesPanel({ meetingId }: { meetingId: number }) {
  const { data, isLoading, error } = useSmartNotes(meetingId);

  // 404 means no notes are attached yet — the ordinary state of a call that just ended, or
  // one where Gemini wasn't taking notes. Not an error.
  if (error instanceof HttpError && error.status === 404) {
    return <Alert severity="info">{describeError(error)}</Alert>;
  }
  if (error) return <Alert severity="error">{describeError(error)}</Alert>;
  if (isLoading) {
    return (
      <Box>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="text" height={24} />
        ))}
      </Box>
    );
  }
  if (!data?.text.trim()) {
    return <Alert severity="info">These smart notes are empty.</Alert>;
  }

  return (
    // No scroll area of its own. This now sits below the call's details inside the
    // Summary tab, and a panel that scrolls independently of the block above it gives the
    // reader two scrollbars for one continuous thought. The page scrolls instead.
    <Box sx={{ maxWidth: "72ch" }}>
      {renderNotes(data.text)}
    </Box>
  );
}

/**
 * Give the notes a shape, without pretending to parse a document format.
 *
 * The backend has already reduced Meet's combined document to a summary, some themed
 * sections and a bullet list (see notesWithoutTranscript). 
 */
function renderNotes(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");

  return lines.map((raw, i) => {
    const line = raw.trim();
    if (!line) return <Box key={i} sx={{ height: 12 }} />;

    if (line.startsWith("* ")) {
      return (
        <Box key={i} sx={{ display: "flex", gap: 1, mb: 0.75, pl: 0.5 }}>
          {/* A real bullet glyph rather than the asterisk Google exported. */}
          <Box component="span" sx={{ color: "text.disabled", lineHeight: 1.6 }}>
            •
          </Box>
          <Typography variant="body2" color="text.secondary">
            {line.slice(2)}
          </Typography>
        </Box>
      );
    }

    // A heading is short and does not end a sentence. Both conditions, because a short
    // line CAN be a one-line paragraph, and a long line is never a heading.
    const isHeading = line.length < 60 && !/[.!?:]$/.test(line);
    if (isHeading) {
      return (
        <Typography
          key={i}
          variant="subtitle2"
          sx={{ mt: i === 0 ? 0 : 2, mb: 0.75 }}
        >
          {line}
        </Typography>
      );
    }

    return (
      <Typography key={i} variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {line}
      </Typography>
    );
  });
}
