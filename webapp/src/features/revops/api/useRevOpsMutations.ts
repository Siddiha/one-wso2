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

// Writes to the Echo (meet-app) backend.
//
// No `retry` here. React Query's mutation default is zero attempts, which is
// what a cancellation wants: the backend refuses with 403 when the caller is
// neither host nor admin, and that is a final answer rather than a blip.
//
// No toasts either — the page owns the wording, because only it knows which
// meeting the user was looking at.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authedDelete } from "@api/http";
import { useAccessToken } from "@hooks/useAccessToken";
import { revOpsServiceUrls } from "@config/apiConfig";

/**
 * DELETE /meetings/{id} — cancels the meeting and its calendar event.
 *
 * Invalidates every `echo-meetings` page rather than the current one: a
 * cancellation changes the row's status, and with server-side paging it can
 * also change what lands on other pages.
 */
export function useCancelMeeting() {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (meetingId) => {
      await authedDelete(revOpsServiceUrls.meeting(meetingId), await getAccessToken());
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["revops-meetings"] });
    },
  });
}
