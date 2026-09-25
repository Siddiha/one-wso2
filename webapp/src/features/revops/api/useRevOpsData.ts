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

// Reads from the Echo (meet-app) backend.
//
// Every key is scoped to the signed-in subject so switching accounts in one tab
// cannot serve the previous user's meetings from cache — the list is filtered
// by the caller's own access, so the rows themselves are user-specific.
//
// See docs/ported-apps/revops-meetings.md §5 for the contract.

import { useQuery } from "@tanstack/react-query";
import { useAsgardeo } from "@asgardeo/react";
import { authedGet } from "@api/http";
import { useAccessToken } from "@hooks/useAccessToken";
import {
  buildMeetingsUrl,
  revOpsServiceUrls,
  isRevOpsBackendConfigured,
} from "@config/apiConfig";
import { foldIdentityError, useAsgardeoSub } from "@hooks/useAsgardeoSub";
import { revOpsRetry } from "../util/revOpsError";
import type {
  AttachmentList,
  RevOpsUserInfo,
  Meeting,
  MeetingList,
  PlaybackUrl,
  Regions,
  SmartNotes,
  Transcript,
} from "./revOpsTypes";

export { isRevOpsBackendConfigured };

/** Everything every query here needs, gathered once. */
function useRevOpsQueryBasis() {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const { state: subState, retry: retryIdentity } = useAsgardeoSub();
  const userSub = subState.status === "ready" ? subState.sub : undefined;
  const ready = isSignedIn && isRevOpsBackendConfigured() && Boolean(userSub);
  return { getAccessToken, subState, retryIdentity, userSub, ready };
}

/**
 * The caller's profile and meet-app privileges.
 *
 * Also the query whose 403 tells us the caller is in no authorised group, since
 * the service refuses every endpoint in that case — so the page asks this one
 * question rather than showing four copies of the same refusal.
 */
export function useRevOpsUserInfo() {
  const { getAccessToken, subState, retryIdentity, userSub, ready } = useRevOpsQueryBasis();
  const query = useQuery<RevOpsUserInfo>({
    queryKey: ["revops-user-info", userSub],
    enabled: ready,
    queryFn: async () => authedGet<RevOpsUserInfo>(revOpsServiceUrls.userInfo, await getAccessToken()),
    staleTime: 5 * 60 * 1000,
    retry: revOpsRetry,
  });
  return foldIdentityError(query, subState, retryIdentity);
}

/**
 * The regions the filter offers.
 *
 * Deployment-wide rather than per-user, but still keyed by subject: whether the
 * call succeeds at all depends on the caller's group, so a 403 cached under a
 * shared key would follow the next account into the tab.
 */
export function useRevOpsRegions() {
  const { getAccessToken, userSub, ready } = useRevOpsQueryBasis();
  return useQuery<Regions>({
    queryKey: ["revops-regions", userSub],
    enabled: ready,
    queryFn: async () => authedGet<Regions>(revOpsServiceUrls.regions, await getAccessToken()),
    // Regions change about never; an hour keeps the filter from re-fetching on
    // every visit to the page.
    staleTime: 60 * 60 * 1000,
    retry: revOpsRetry,
  });
}

export interface MeetingsQueryParams {
  /** Title search. Sent as `searchString`; see buildMeetingsUrl for why. */
  search: string | null;
  /** Region name, or null for every region. */
  region: string | null;
  /**
   * True for the Past scope, which asks for meetings that have already ended.
   *
   * A boolean rather than the timestamp itself, deliberately. The cutoff is "now", and
   * "now" has to advance -- a caller that computes it once and passes it in freezes the
   * list at the moment the scope was chosen, and because the value would also be part of
   * the query key, every later refetch reuses the stale key and cannot recover. So the
   * instant is produced inside the fetch below, where it is fresh every time.
   */
  pastOnly: boolean;
  page: number;
  pageSize: number;
}

/**
 * One page of meetings.
 *
 * Paging is server-side: the key carries every filter AND the page, so moving
 * between pages is a cache hit on the way back rather than a refetch, and
 * changing a filter is a different key rather than a mutation of this one.
 *
 * `refetchOnMount` is opted back in because the app-wide client disables it.
 * A meeting list that never refreshed on returning to the page would show a
 * cancelled meeting as active for as long as the tab stayed open.
 */
export function useMeetings(params: MeetingsQueryParams) {
  const { getAccessToken, subState, retryIdentity, userSub, ready } = useRevOpsQueryBasis();
  const { search, region, pastOnly, page, pageSize } = params;

  const query = useQuery<MeetingList>({
    // `pastOnly`, not the instant it resolves to: an exact timestamp in the key would
    // make every render a new key. Freshness comes from staleTime instead -- each refetch
    // recomputes the cutoff below.
    queryKey: ["revops-meetings", userSub, search, region, pastOnly, page, pageSize],
    enabled: ready,
    queryFn: async () =>
      authedGet<MeetingList>(
        buildMeetingsUrl({
          searchString: search,
          region,
          endTime: pastOnly ? new Date().toISOString() : null,
          limit: pageSize,
          offset: page * pageSize,
        }),
        await getAccessToken(),
      ),
    staleTime: 60 * 1000,
    refetchOnMount: true,

    // Keeps the previous page's rows on screen while the next one loads, so
    // paging doesn't collapse the table to a spinner and back — but only for the
    // same signed-in user. previousData is whatever the LAST key showed, even one
    // keyed to another account, so without this check a change of subject would
    // briefly show the previous user's meetings.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === userSub ? previous : undefined,
    
    retry: revOpsRetry,
  });
  return foldIdentityError(query, subState, retryIdentity);
}

/**
 * One meeting's Drive attachments, fetched only once a row is opened.
 *
 * `enabled` on a non-null id rather than a separate imperative fetch, so the
 * dialog gets React Query's loading and error states for free and a second
 * open of the same row is instant.
 *
 * Worth knowing: this GET has a side effect on the server — it grants the host
 * editor permission on any video/mp4 attachment. That is why it is not
 * prefetched for every visible row.
 */
export function useMeetingAttachments(meetingId: number | null) {
  const { getAccessToken, userSub, ready } = useRevOpsQueryBasis();
  return useQuery<AttachmentList>({
    queryKey: ["revops-attachments", userSub, meetingId],
    enabled: ready && meetingId !== null,
    queryFn: async () =>
      authedGet<AttachmentList>(
        revOpsServiceUrls.attachments(meetingId as number),
        await getAccessToken(),
      ),
    staleTime: 5 * 60 * 1000,
    retry: revOpsRetry,
  });
}

/**
 * A signed URL for streaming one meeting's recording.
 *
 * `enabled` on a non-null id, so nothing is requested until someone actually opens a
 * recording.
 *
 * `staleTime: 0` and no caching beyond the component's life: the URL expires, and a cached
 * one handed to a player an hour later is a token that fails on its first range request.
 
 * `retry: false` on purpose. The failures here are 404 (playback not configured, or no
 * recording attached yet) and 403 (not your meeting) 
 */
export function useRecordingPlayback(meetingId: number | null) {
  const { getAccessToken, userSub, ready } = useRevOpsQueryBasis();
  return useQuery<PlaybackUrl>({
    queryKey: ["revops-playback", userSub, meetingId],
    enabled: ready && meetingId !== null,
    queryFn: async () =>
      authedGet<PlaybackUrl>(
        revOpsServiceUrls.playback(meetingId as number),
        await getAccessToken(),
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/**
 * One meeting, resolved from its id alone.
 *
 * What the detail page loads from. Deliberately not read out of the list's cache: a page
 * reached by a shared link or a refresh has no list behind it, and a page that only worked
 * when you arrived by clicking would be a page that breaks exactly when someone shares it.
 */
export function useMeeting(meetingId: number | null) {
  const { getAccessToken, subState, retryIdentity, userSub, ready } = useRevOpsQueryBasis();
  const query = useQuery<Meeting>({
    queryKey: ["revops-meeting", userSub, meetingId],
    enabled: ready && meetingId !== null,
    queryFn: async () =>
      authedGet<Meeting>(
        revOpsServiceUrls.meetingById(meetingId as number),
        await getAccessToken(),
      ),
    staleTime: 60 * 1000,
    retry: revOpsRetry,
  });
  return foldIdentityError(query, subState, retryIdentity);
}

/**
 * The transcript, as timed lines.
 *
 * `enabled` on a non-null id so nothing is fetched until the tab is openedd.
 *
 * `retry: false`: the failures are 404 (no timed transcript for this meeting) and 403 (not
 * yours), both final.
 */
export function useTranscript(meetingId: number | null) {
  const { getAccessToken, userSub, ready } = useRevOpsQueryBasis();
  return useQuery<Transcript>({
    queryKey: ["revops-transcript", userSub, meetingId],
    enabled: ready && meetingId !== null,
    queryFn: async () =>
      authedGet<Transcript>(revOpsServiceUrls.transcript(meetingId as number), await getAccessToken()),
    // A finished meeting's transcript never changes, so it is worth holding for the visit.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}

/** The smart notes, as plain text. Same gating and reasoning as useTranscript. */
export function useSmartNotes(meetingId: number | null) {
  const { getAccessToken, userSub, ready } = useRevOpsQueryBasis();
  return useQuery<SmartNotes>({
    queryKey: ["revops-smart-notes", userSub, meetingId],
    enabled: ready && meetingId !== null,
    queryFn: async () =>
      authedGet<SmartNotes>(revOpsServiceUrls.smartNotes(meetingId as number), await getAccessToken()),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}
