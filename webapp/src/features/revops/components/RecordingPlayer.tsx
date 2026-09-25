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

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Alert, Box, Button, Paper, Skeleton } from "@wso2/oxygen-ui";
import { HttpError } from "@api/http";
import { useRecordingPlayback } from "../api/useRevOpsData";
import { describeError } from "../util/revOpsError";

/**
 * The recording, played in the page.
 *
 * Streamed by drive-service, which holds the Google credential and answers HTTP Range
 * requests 
 */
/** What the page can ask of the player. */
export interface RecordingPlayerHandle {
  /** Jump to a position, in seconds, and start playing. */
  seekTo: (seconds: number) => void;
}

/**
 * Exposes seeking through a ref rather than handing the raw <video> element upwards.
 *
 * The transcript needs exactly one verb — "go to this second" — and giving it the element
 * would let any caller reassign `src` or read internals this component manages. A named
 * handle keeps the player's own concerns (token refresh, error recovery) its own.
 */
const RecordingPlayer = forwardRef<RecordingPlayerHandle, {
  meetingId: number;
  /** Called as playback proceeds, so a transcript can mark the current line. */
  onTimeUpdate?: (seconds: number) => void;
  /**
   * The recording's length, once the browser has read enough to know it.
   *
   * The speaker timeline needs it to place marks: the transcript alone only says when
   * the last person stopped talking, which is not where the recording ends.
   */
  onDurationChange?: (seconds: number) => void;
}>(function RecordingPlayer({ meetingId, onTimeUpdate, onDurationChange }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = seconds;
      // Playing on seek is the behaviour a reader expects from clicking a line: they asked
      // to hear that part, not to park the playhead on it.
      void video.play();
      // Scroll the player into view — on a narrow screen the transcript may be the only
      // thing visible, and a video that starts playing off-screen reads as nothing happening.
      video.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
  }), []);
  const { data, isLoading, error, refetch } = useRecordingPlayback(meetingId);
  // Raised only after a retry has already failed, so a single expiry recovers silently
  // rather than blaming the viewer for a token they never saw.
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const retriedRef = useRef(false);
  // Position to restore after a re-minted URL reloads the element. 0 means nothing to do.
  const resumeAtRef = useRef(0);

  /**
   * Recover from a token that expired mid-playback.
   *
   * Playback is not one request but many: the browser buffers ahead and every seek is a
   * fresh range request. So an expired token does not fail cleanly -- what is already
   * buffered keeps playing and the NEXT range request is refused, which reaches the viewer
   * as an unexplained stall. Minting a fresh URL and restoring the position turns that into
   * a blink.
   *
   * Retried once. If a second URL fails too the cause is not expiry, and reloading forever
   * would hammer the backend while showing the viewer nothing.
   */
  const handleError = useCallback(async () => {
    if (retriedRef.current) {
      setPlaybackFailed(true);
      return;
    }
    retriedRef.current = true;

    // Remembered, not applied. React owns `src` (it is bound to data.url below), and
    // refetch() updates data, so React re-renders and re-assigns src itself. Assigning
    // videoRef.current.src here as well raced that render: whichever landed second won,
    // and the seek-restore attached to the losing load was silently dropped. The position
    // is parked here instead and applied by onLoadedMetadata, whichever load wins.
    resumeAtRef.current = videoRef.current?.currentTime ?? 0;

    const refreshed = await refetch();
    if (!refreshed.data?.url) {
      setPlaybackFailed(true);
    }
  }, [refetch]);

  // 404 is not a failure worth an error banner: it means either this deployment has no
  // playback configured, or the recording has not finished processing -- which is the
  // ordinary state of a meeting that just ended. The backend's own message says which.
  const notAvailable = error instanceof HttpError && error.status === 404;

  if (isLoading) {
    return <Skeleton variant="rectangular" sx={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 1 }} />;
  }
  if (notAvailable) {
    return <Alert severity="info">{describeError(error)}</Alert>;
  }
  if (error) {
    return <Alert severity="error">{describeError(error)}</Alert>;
  }
  if (playbackFailed) {
    return (
      <Alert
        severity="error"
        action={
          <Button
            size="small"
            onClick={() => {
              retriedRef.current = false;
              setPlaybackFailed(false);
              void refetch();
            }}
          >
            Try again
          </Button>
        }
      >
        The recording stopped playing. It may have been moved, or your access to it changed.
      </Alert>
    );
  }
  if (!data) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1, overflow: "hidden" }}>
      <Box
        ref={videoRef}
        component="video"
        src={data.url}
        controls
        // Not autoplay: a recording is long and often opened just to see what it is, and a
        // browser would block the sound anyway.
        preload="metadata"
        onError={handleError}
        onTimeUpdate={
          onTimeUpdate
            ? (e) => onTimeUpdate((e.currentTarget as HTMLVideoElement).currentTime)
            : undefined
        }
        onLoadedMetadata={(e) => {
          const video = e.currentTarget as HTMLVideoElement;
          const d = video.duration;
          // Infinity until a streamed file's length is known — reporting that
          // would make every timeline mark divide by it.
          if (onDurationChange && Number.isFinite(d)) onDurationChange(d);
          // A reload caused by a re-minted URL discards the position. Restore it here
          // rather than from the error handler, so it applies to whichever load actually
          // happened instead of the one that handler expected.
          if (resumeAtRef.current > 0) {
            video.currentTime = resumeAtRef.current;
            resumeAtRef.current = 0;
            void video.play();
          }
        }}
        // Clears the retry latch only once the replacement is genuinely playing. The rule
        // is "two CONSECUTIVE failures means it is not expiry"; a replacement that fails
        // before it plays leaves the latch set, so it still only ever retries once.
        onPlaying={() => {
          retriedRef.current = false;
        }}
        sx={{ width: "100%", display: "block", borderRadius: 0.5, bgcolor: "common.black" }}
      />
    </Paper>
  );
});

export default RecordingPlayer;
