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

import { useMemo } from "react";
import { Box, Skeleton, Tooltip, Typography, useTheme } from "@wso2/oxygen-ui";
import { formatOffset, type TranscriptLine } from "../api/revOpsTypes";
import { useTranscript } from "../api/useRevOpsData";

/**
 * Who spoke, when, and how much — one track per person under the recording.
 *
 * The question it answers is "who dominated this call", which on a sales call is a
 * read on whether the customer was engaged or talked at. A share of talk time answers
 * that at a glance in a way a transcript never does.
 *
 * ONE HUE PER SPEAKER, from a fixed order, measured rather than judged.
 *
 * The palette validator was run over the categorical ramp for this chart's own pairlist.
 * These are stacked, individually labelled tracks, so a reader compares each row with its
 * NEIGHBOURS -- the adjacent pairlist, the same case as bars and stacks. All eight slots
 * pass there in both modes (worst adjacent CVD ΔE 9.1 light / 8.4 dark; worst
 * normal-vision ΔE 19.6 / 19.3). Three light-mode hues sit below 3:1 against the surface,
 * which the relief rule permits given a visible direct label on every row -- which this has.
 *
 * (The stricter all-pairs list, for interleaved marks like scatter, fails past three
 * slots. It does not apply here: the rows never overlap.)
 *
 * Colour follows the SPEAKER, not their rank. Rows are sorted loudest-first, so keying
 * colour off row order would repaint everyone whenever the ordering changed; it is keyed
 * off first appearance in the transcript instead, which is stable.
 *
 * Past eight speakers hues stop being assigned and a neutral is used, rather than
 * generating a ninth. Nothing is lost: the row's label already names the person.
 */
export default function SpeakerTimeline({
  meetingId,
  durationSeconds,
  currentTime,
  onSeek,
}: {
  meetingId: number;
  /** The recording's length, from the player. Falls back to the transcript's own span. */
  durationSeconds: number;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const theme = useTheme();
  // Same query key as the transcript panel, so this shares its cache rather than
  // fetching the conversation a second time.
  const { data, isLoading } = useTranscript(meetingId);

  const lines = useMemo(() => data?.lines ?? [], [data]);

  const { speakers, span } = useMemo(() => summarise(lines, durationSeconds), [lines, durationSeconds]);

  if (isLoading) {
    return (
      <Box sx={{ mt: 2 }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} variant="rectangular" height={22} sx={{ mb: 1, borderRadius: 0.5 }} />
        ))}
      </Box>
    );
  }
  // Silent when there is nothing to show. A meeting with no timed transcript already
  // says so in the Transcript tab; repeating it under the player would be two
  // explanations of one absence.
  if (speakers.length === 0 || span <= 0) return null;

  const playheadPct = Math.min(100, Math.max(0, (currentTime / span) * 100));

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Talk time
      </Typography>

      {/* Position is relative so one playhead can span every track. */}
      <Box sx={{ position: "relative" }}>
        {speakers.map((s) => (
          <Box
            key={s.name}
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 150px) 1fr 44px",
              alignItems: "center",
              gap: 1.5,
              mb: 1,
            }}
          >
            {/* The swatch beside the name is what makes the label double as the legend:
                every series is named next to its own colour, so identity is never carried
                by hue alone and no separate legend box is needed. */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
              <Box
                aria-hidden
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "2px",
                  flexShrink: 0,
                  bgcolor: hueFor(s.order, theme.palette.mode === "dark"),
                }}
              />
              <Typography
                variant="caption"
                sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={s.name}
              >
                {s.name}
              </Typography>
            </Box>

            <Box
              sx={{
                position: "relative",
                height: 14,
                borderRadius: 0.5,
                bgcolor: "action.hover",
                overflow: "hidden",
              }}
            >
              {s.segments.map((seg, i) => (
                <Tooltip
                  key={i}
                  arrow
                  title={`${s.name} · ${formatOffset(seg.start)}`}
                  disableInteractive
                >
                  <Box
                    onClick={() => onSeek(seg.start)}
                    component="button"
                    type="button"
                    aria-label={`Play from ${formatOffset(seg.start)}, ${s.name} speaking`}
                    sx={{
                      position: "absolute",
                      // CLAMPED to the track, like the playhead above. `span` is the
                      // player's duration when it has one and the transcript's last end
                      // otherwise, and those two do not have to agree: a recording that was
                      // stopped and restarted is shorter than the transcript covering the
                      // whole call, so a late segment's start can exceed it and would
                      // otherwise be painted past the right-hand edge.
                      left: `${Math.min(100, Math.max(0, (seg.start / span) * 100))}%`,
                      // A floor so a one-word utterance is still clickable and visible;
                      // without it the shortest segments vanish at this scale. Capped at
                      // whatever track remains to the right of `left`.
                      width: `max(3px, ${Math.min(
                        100 - Math.min(100, Math.max(0, (seg.start / span) * 100)),
                        (seg.duration / span) * 100,
                      )}%)`,
                      top: 0,
                      bottom: 0,
                      p: 0,
                      border: 0,
                      borderRadius: 0.5,
                      cursor: "pointer",
                      bgcolor: hueFor(s.order, theme.palette.mode === "dark"),
                      "&:hover": { filter: "brightness(1.15)" },
                      // INSET, because the track clips its children (overflow: hidden)
                      // and a normal outline would be cut off. These segments are
                      // tabbable and carry an aria-label, so without this a keyboard
                      // user moves through them with nothing on screen changing.
                      "&:focus-visible": {
                        outline: "2px solid",
                        outlineColor: theme.palette.getContrastText(
                          hueFor(s.order, theme.palette.mode === "dark"),
                        ),
                        outlineOffset: "-2px",
                      },
                    }}
                  />
                </Tooltip>
              ))}
            </Box>

            {/* Share of talk time. The number is the comparison; the track is the shape
                of it. Text wears a text token, never the mark's colour. */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}
            >
              {s.sharePct}%
            </Typography>
          </Box>
        ))}

        {/* Playhead, drawn across every track so the rows read against one clock. */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `calc(150px + ${theme.spacing(1.5)} + (100% - 150px - 44px - ${theme.spacing(3)}) * ${playheadPct / 100})`,
            width: "2px",
            bgcolor: "text.primary",
            opacity: 0.55,
            pointerEvents: "none",
          }}
        />
      </Box>
    </Box>
  );
}

/**
 * The categorical order, light and dark steps. The dark column is the same eight hues
 * re-stepped for a dark surface, not an automatic flip of the light ones.
 */
const SPEAKER_HUES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
} as const;

interface Segment {
  start: number;
  duration: number;
}

interface SpeakerSummary {
  name: string;
  /** Index of first appearance — what colour is keyed off. */
  order: number;
  segments: Segment[];
  talkSeconds: number;
  sharePct: number;
}

/**
 * Group the transcript into one track per speaker.
 *
 * Duration comes from each line's absolute start/end rather than from the gap to the
 * next line: a pause between utterances is not speech, and counting it would inflate
 * whoever happened to speak before a silence.
 *
 * `span` is the recording's length when the player knows it, and the last line's end
 * otherwise — a transcript that stops before the recording does would otherwise stretch
 * to fill the track and put every mark in the wrong place.
 */
function summarise(
  lines: TranscriptLine[],
  durationSeconds: number,
): { speakers: SpeakerSummary[]; span: number } {
  if (lines.length === 0) return { speakers: [], span: 0 };

  const byName = new Map<string, Segment[]>();
  // Insertion order of this map IS first-appearance order, which is what colour keys off.
  const firstSeen = new Map<string, number>();
  let lastEnd = 0;

  for (const line of lines) {
    const start = line.offsetSeconds;
    const startMs = Date.parse(line.startTime);
    const endMs = Date.parse(line.endTime);
    // A line whose timestamps don't parse still counts as speech — a nominal second
    // keeps it on the track rather than dropping the utterance entirely.
    const duration =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? (endMs - startMs) / 1000
        : 1;

    lastEnd = Math.max(lastEnd, start + duration);
    if (!firstSeen.has(line.speaker)) firstSeen.set(line.speaker, firstSeen.size);
    const segments = byName.get(line.speaker) ?? [];
    segments.push({ start, duration });
    byName.set(line.speaker, segments);
  }

  const span = durationSeconds > 0 ? durationSeconds : lastEnd;
  const totalTalk = [...byName.values()]
    .flat()
    .reduce((sum, seg) => sum + seg.duration, 0);

  const speakers = [...byName.entries()]
    .map(([name, segments]) => {
      const talkSeconds = segments.reduce((sum, seg) => sum + seg.duration, 0);
      return {
        name,
        order: firstSeen.get(name) ?? 0,
        segments,
        talkSeconds,
        // Share of SPEECH, not of the call: the silences belong to nobody, and
        // dividing by wall-clock would make every share look small and sum to less
        // than 100 for no reason a reader could see.
        sharePct: totalTalk > 0 ? Math.round((talkSeconds / totalTalk) * 100) : 0,
      };
    })
    // Loudest first — the question is who dominated, so the answer should be the top row.
    .sort((a, b) => b.talkSeconds - a.talkSeconds);

  return { speakers, span };
}

/**
 * The hue for a speaker, by first-appearance index.
 *
 * Past the eighth speaker this stops assigning hues and returns a neutral rather than
 * generating or cycling one: a cycled colour says two different people are the same
 * series, which is worse than saying nothing. The row label still names them.
 */
function hueFor(order: number, dark: boolean): string {
  const ramp = dark ? SPEAKER_HUES.dark : SPEAKER_HUES.light;
  return ramp[order] ?? (dark ? "#8a8a8a" : "#6f6f6f");
}
