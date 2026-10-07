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

// Writes to til-backend.
//
// No `retry` on either mutation — React Query's mutation default (zero
// attempts) is what we want, same reasoning as menu: a 400 (What over the max
// chars) or a 403 (deleting without canModerate) is a final answer, not a
// transient failure worth retrying.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authedDelete, authedPost, authedUpload } from "@api/http";
import { useAccessToken } from "@hooks/useAccessToken";
import { tilServiceUrls } from "@config/apiConfig";
import { useAsgardeoSub } from "@hooks/useAsgardeoSub";
import type { TilSubmissionPayload } from "./tilTypes";

function useTilSubmissionsKey(): unknown[] {
  const { state } = useAsgardeoSub();
  return ["til-submissions", state.status === "ready" ? state.sub : undefined];
}

/** POST /submissions. The backend derives the submitter's email from the id_token. */
export function useCreateTilSubmission() {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  const submissionsKey = useTilSubmissionsKey();
  return useMutation<void, Error, TilSubmissionPayload>({
    mutationFn: async (payload) => {
      await authedPost<unknown>(tilServiceUrls.submissions, await getAccessToken(), payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: submissionsKey });
    },
  });
}

/** POST /uploads — an image pasted or picked in the "What did you learn?"
 * editor. Returns the stored image's absolute URL, which the editor inserts
 * directly as an <img src>. Not a React Query mutation hook in the usual
 * sense (no cache to invalidate, nothing in the submissions list changes) —
 * just the auth/upload plumbing, called directly from the editor's own
 * image/paste handlers rather than via `.mutate(...)`. */
export function useUploadTilImage() {
  const getAccessToken = useAccessToken();
  return async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const result = await authedUpload<{ url: string }>(tilServiceUrls.uploads, await getAccessToken(), formData);
    return result.url;
  };
}

/** DELETE /submissions/{id}. The backend re-checks canModerate — this is presentation-only gating. */
export function useDeleteTilSubmission() {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  const submissionsKey = useTilSubmissionsKey();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await authedDelete(tilServiceUrls.submission(id), await getAccessToken());
    },
    onSuccess: async (_data, id) => {
      // Without this, a cached ["til-submission", sub, id] detail entry
      // survives the delete -- a tab with that entry's page already open
      // (or a link to it clicked right after) can show the stale cached
      // entry before the backend's own 404 arrives.
      qc.removeQueries({ queryKey: ["til-submission", submissionsKey[1], id] });
      await qc.invalidateQueries({ queryKey: submissionsKey });
    },
  });
}
