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

import { useRef, useState } from "react";
import { Link as RouterLink, useParams } from "react-router";
import {
  Alert,
  Box,
  Breadcrumbs,
  Chip,
  Divider,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@wso2/oxygen-ui";
import { isRevOpsBackendConfigured, useMeeting } from "../api/useRevOpsData";
import {
  meetingCustomer,
  meetingTypeLabel,
  parseOpportunityDetails,
} from "../api/revOpsTypes";
import RevOpsShell from "../components/RevOpsShell";
import RecordingPlayer, { type RecordingPlayerHandle } from "../components/RecordingPlayer";
import TranscriptPanel from "../components/TranscriptPanel";
import SmartNotesPanel from "../components/SmartNotesPanel";
import SpeakerTimeline from "../components/SpeakerTimeline";
import { describeError, isForbidden } from "../util/revOpsError";
import { formatDateTime, splitParticipants } from "../util/revOpsTime";

/**
 * One meeting: the recording, and the context around it.
 *
 * A ROUTE rather than a dialog, which is the whole point of moving it here. A recording is
 * something people send each other -- "watch the first ten minutes of this" -- and a dialog
 * has no address. This does: /revops/meetings/42 survives a refresh, a bookmark and a
 * paste into Slack, because the page resolves itself from the id rather than from whatever
 * the list happened to be holding.
 *
 * TWO COLUMNS because the left one drives the right: clicking a transcript line seeks the
 * recording. That interaction is the reason the player is a native <video> and not a Drive
 * iframe — an iframe would show the recording but expose no way to set its position.
 */
export default function MeetingDetailPage() {
  const { meetingId: rawId } = useParams();
  const meetingId = Number(rawId);
  const validId = Number.isInteger(meetingId) && meetingId > 0;

  const configured = isRevOpsBackendConfigured();
  const playerRef = useRef<RecordingPlayerHandle>(null);
  // Held here rather than inside the transcript: the player owns the position, and the
  // transcript is one of possibly several things that want to know it.
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Reset the clock when the route moves to a different meeting.
  //
  // Changing `:meetingId` does NOT unmount this page -- React Router swaps the param and
  // re-renders -- so without this, meeting A's position survives into meeting B: the
  // timeline draws a playhead partway through a recording that has not started, and the
  // transcript highlights whatever line that instant lands on, until B's video happens to
  // emit its first event.
  //
  // Done during render rather than in an effect. This is React's documented way to adjust
  // state when a prop changes: the re-render happens before anything is painted, so the
  // wrong position is never on screen, and an effect would both paint it first and trip
  // the set-state-in-effect rule.
  const [clockOwner, setClockOwner] = useState(meetingId);
  if (clockOwner !== meetingId) {
    setClockOwner(meetingId);
    setCurrentTime(0);
    setDuration(0);
  }
  // Tab state is local, not a route. Unlike the meeting itself — which must be linkable —
  // which pane you were reading is not something anyone shares.
  // Summary first, and the default: someone opening a call wants to know what it was
  // about before they want to read it word for word.
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  const { data: meeting, isLoading, error } = useMeeting(validId ? meetingId : null);

  const forbidden = isForbidden(error);
  const participants = splitParticipants(meeting?.internalParticipants);
  const externals = splitParticipants(meeting?.externalParticipants);
  const customer = meeting ? meetingCustomer(meeting) : null;
  const typeLabel = meetingTypeLabel(meeting?.meetingType);
  const deal = parseOpportunityDetails(meeting?.opportunityDetails);

  return (
    <RevOpsShell
      title={meeting?.title ?? "Meeting"}
      configured={configured}
      configKey="ONE_WSO2_REVOPS_BACKEND_URL"
      forbidden={forbidden}
    >
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/revops" underline="hover" color="inherit">
          Meetings
        </Link>
        <Typography color="text.primary" variant="body2">
          {meeting?.title ?? "…"}
        </Typography>
      </Breadcrumbs>

      {!validId ? (
        <Alert severity="error">That is not a valid meeting reference.</Alert>
      ) : isLoading ? (
        <Skeleton variant="rectangular" sx={{ width: "100%", height: 420, borderRadius: 1 }} />
      ) : error && !forbidden ? (
        <Alert severity="error">{describeError(error)}</Alert>
      ) : meeting ? (
        <Box
          sx={{
            display: "grid",
            // One column until there is room for two. The video is the thing worth the
            // width, so it takes the larger share once the split happens.
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) minmax(0, 1.4fr)" },
            gap: 3,
            alignItems: "start",
          }}
        >
          {/* LEFT — the summary, and the conversation behind it. */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Tabs
              value={tab}
              onChange={(_, next: "summary" | "transcript") => setTab(next)}
              sx={{ mb: 2, minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none" } }}
            >
              <Tab value="summary" label="Summary" />
              <Tab value="transcript" label="Transcript" />
            </Tabs>

            {/* Each panel is mounted only while selected, so opening a meeting does not
                fetch a transcript of thousands of lines for someone who came to check the
                account name. The queries are keyed per meeting, so switching back is a
                cache hit rather than a refetch. */}
            {tab === "summary" && (
              // ONE scroll region for the whole tab — the details and the notes are one
              // continuous read, and they are long together. The notes panel deliberately
              // has no scroll of its own, so this is the only scrollbar. Matches the
              // height the Transcript tab uses, so switching tabs doesn't resize the page.
              <Box sx={{ maxHeight: "60vh", overflowY: "auto", pr: 1 }}>
                {/* The call's own facts lead, because they frame everything under them:
                    Gemini's notes read very differently once you know this was a renewal
                    with the customer's own team in the room. Previously these sat in a
                    third tab, which meant the reader had to go and get the context
                    before the summary meant anything. */}
                <Stack spacing={2}>
                  <Detail label="Account" value={customer} />
                  <Detail label="Call type" value={typeLabel} />
                  <Detail label="Account owner" value={meeting.host} />
                  <Detail label="Started" value={formatDateTime(meeting.startTime)} />
                  <Detail label="Ended" value={formatDateTime(meeting.endTime)} />

                  {deal && (
                    <>
                      <Divider />
                      <Typography variant="subtitle2">Opportunity</Typography>
                      <Detail label="Stage" value={deal.stage ?? null} />
                      <Detail
                        label="Amount"
                        value={
                          deal.amount != null
                            ? `${deal.currency ?? ""} ${deal.amount.toLocaleString()}`.trim()
                            : null
                        }
                      />
                      <Detail label="Close date" value={deal.closeDate ?? null} />
                    </>
                  )}

                  <Divider />
                  <ParticipantList label="WSO2 participants" emails={participants} />
                  {/* Separated from the internal list rather than merged: on a sales call
                      the question is usually "who was there from the customer", and one
                      combined list of a dozen addresses answers it slowly. */}
                  <ParticipantList
                    label="External participants"
                    emails={externals}
                    // Null means the meeting predates external attendees being captured —
                    // not that nobody external attended.
                    unknown={meeting.externalParticipants == null}
                  />
                </Stack>

                <Divider sx={{ my: 2.5 }} />

                <SmartNotesPanel meetingId={meeting.meetingId} />
              </Box>
            )}

            {tab === "transcript" && (
              <TranscriptPanel
                meetingId={meeting.meetingId}
                currentTime={currentTime}
                onSeek={(seconds) => playerRef.current?.seekTo(seconds)}
              />
            )}
          </Paper>

          {/* RIGHT — the recording. */}
          <Box>
            <RecordingPlayer
              // Remount per meeting: the player keeps its own retry latch and failure
              // flag, and a <video> reused across a src change can carry the old
              // element's buffered state with it.
              key={meeting.meetingId}
              ref={playerRef}
              meetingId={meeting.meetingId}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setDuration}
            />

            {/* Under the recording, sharing its clock: who spoke and when. */}
            <SpeakerTimeline
              meetingId={meeting.meetingId}
              durationSeconds={duration}
              currentTime={currentTime}
              onSeek={(seconds) => playerRef.current?.seekTo(seconds)}
            />
          </Box>
        </Box>
      ) : null}
    </RevOpsShell>
  );
}

/** A labelled set of attendees, as chips. */
function ParticipantList({
  label,
  emails,
  unknown,
}: {
  label: string;
  emails: string[];
  /** True when the absence is missing data rather than an empty guest list. */
  unknown?: boolean;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
        {label}
      </Typography>
      {unknown ? (
        <Typography variant="body2" color="text.secondary">
          Not recorded for this meeting
        </Typography>
      ) : emails.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          None
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
          {emails.map((email) => (
            <Chip key={email} label={email} size="small" variant="outlined" />
          ))}
        </Box>
      )}
    </Box>
  );
}

/** One labelled value. Renders an em dash rather than nothing, so the rows stay aligned. */
function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2">{value?.trim() ? value : "—"}</Typography>
    </Box>
  );
}
