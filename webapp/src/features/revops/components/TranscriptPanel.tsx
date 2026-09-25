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

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  InputAdornment,
  Skeleton,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { SearchIcon } from "@wso2/oxygen-ui-icons-react";
import { HttpError } from "@api/http";
import { formatOffset } from "../api/revOpsTypes";
import { useTranscript } from "../api/useRevOpsData";
import { describeError } from "../util/revOpsError";

/**
 * The conversation, with every line a way into the recording.
 *
 * Clicking a line seeks the video to where it was said. That is the whole reason the player
 * is a native <video> rather than a Drive iframe: an iframe would show the recording but
 * expose no way to set its position, so this interaction would be impossible.
 *
 * `onSeek` is passed in rather than the video ref, so this component knows nothing about
 * how playback works — it reports which second the reader asked for.
 */
export default function TranscriptPanel({
  meetingId,
  onSeek,
  currentTime,
}: {
  meetingId: number;
  onSeek: (seconds: number) => void;
  /** Player position, so the line being spoken can be marked. */
  currentTime: number;
}) {
  const { data, isLoading, error } = useTranscript(meetingId);
  const [query, setQuery] = useState("");

  // Memoised, not `data?.lines ?? []` inline: that allocates a fresh array every render,
  // which would make both memos below recompute on every keystroke and every tick of the
  // player's time update — over a transcript that can run to thousands of lines.
  const lines = useMemo(() => data?.lines ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) => l.text.toLowerCase().includes(q) || l.speaker.toLowerCase().includes(q),
    );
  }, [lines, query]);

  // The line being spoken now: the last one that started at or before the playhead. Found
  // by scanning back from the end rather than forward, since a transcript is ordered and
  // the answer is nearly always near where playback is.
  const activeIndex = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i].offsetSeconds <= currentTime) return i;
    }
    return -1;
  }, [lines, currentTime]);

  // 404 means this meeting has no TIMED transcript — it predates the resource name being
  // stored, so only the Drive document exists. Said plainly rather than as an error,
  // because nothing is broken.
  if (error instanceof HttpError && error.status === 404) {
    return (
      <Alert severity="info">
        No synchronised transcript for this meeting. Older recordings only have the
        transcript document, which is linked under Files.
      </Alert>
    );
  }
  if (error) return <Alert severity="error">{describeError(error)}</Alert>;
  if (isLoading) {
    return (
      <Box>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="text" height={28} />
        ))}
      </Box>
    );
  }
  if (lines.length === 0) {
    return <Alert severity="info">This transcript is empty.</Alert>;
  }

  return (
    <Box>
      <TextField
        fullWidth
        size="small"
        type="search"
        placeholder="Search in transcript"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 1.5 }}
        slotProps={{
          // A placeholder is not an accessible name: it disappears on focus and is
          // not reliably announced. The field is labelled by its icon visually, so
          // the name goes here rather than as a visible <label>.
          htmlInput: { "aria-label": "Search transcript" },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon size={16} />
              </InputAdornment>
            ),
          },
        }}
      />

      {/* Filtering happens here rather than on the server: the whole transcript is already
          loaded, so a round trip would be slower and would lose the scroll position. */}
      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing matches “{query}”.
        </Typography>
      ) : (
        <Box sx={{ maxHeight: "60vh", overflowY: "auto", pr: 1 }}>
          {filtered.map((line, i) => {
            const isActive = !query && i === activeIndex;
            return (
              <Box
                key={`${line.startTime}-${i}`}
                onClick={() => onSeek(line.offsetSeconds)}
                // A button, not a div with a click: this is an action, and it has to be
                // reachable and operable from the keyboard like any other.
                component="button"
                type="button"
                sx={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  borderLeft: 2,
                  borderColor: isActive ? "primary.main" : "transparent",
                  bgcolor: isActive ? "action.selected" : "transparent",
                  cursor: "pointer",
                  px: 1.5,
                  py: 1,
                  font: "inherit",
                  borderRadius: 1,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline", mb: 0.25 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
                  >
                    {formatOffset(line.offsetSeconds)}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {line.speaker}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.primary">
                  {line.text}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
