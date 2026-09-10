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

// Design Studio → Post Builder's shared background-image library data layer,
// ported from the Marketing Ops frontend's design-studio/api.ts. Images are
// uploaded once, shared across users, and immutable in content (only name/
// description are editable) — all routes are gated server-side by the
// designstudio capability; the gateway assertion rides on the Authorization
// header, same as every other Marketing Ops backend call.
//
// List/create/update/delete go through TanStack Query, matching
// useCampaignTracker.ts's pattern. Thumbnail/full-image fetches stay as plain
// (non-React-Query) blob-URL-caching functions: the response is BINARY, not
// JSON, so it needs the blob-with-Authorization-header path (see
// @features/finance/util/financeReceipts for the established pattern here),
// and — since image content never changes for a given id — a cache that never
// invalidates is simpler and cheaper than modeling it as a query.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAsgardeo } from "@asgardeo/react";
import { authedDelete, authedGet, authedPost, authedPut, fetchWithReauth, HttpError } from "@api/http";
import { httpRetry } from "@api/errors";
import { useAccessToken } from "@hooks/useAccessToken";
import { isMarketingOpsBackendConfigured, marketingOpsServiceUrls as urls } from "@config/apiConfig";

export interface BackgroundImageSummary {
  id: string;
  name: string;
  description?: string | null;
  mime: string;
  size_bytes: number;
  uploaded_by_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackgroundImageList {
  images: BackgroundImageSummary[];
  limit: number;
}

const KEY = {
  list: ["marketing-ops", "design-studio", "background-images"] as const,
};

function useBase() {
  const { isSignedIn } = useAsgardeo();
  const getAccessToken = useAccessToken();
  const ready = isSignedIn && isMarketingOpsBackendConfigured();
  return { getAccessToken, ready };
}

export function useBackgroundImages() {
  const { getAccessToken, ready } = useBase();
  return useQuery<BackgroundImageList>({
    queryKey: KEY.list,
    enabled: ready,
    queryFn: async () =>
      authedGet<BackgroundImageList>(urls.designStudioBackgroundImages, await getAccessToken()),
    retry: httpRetry,
  });
}

export function useUploadBackgroundImage() {
  const { getAccessToken } = useBase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      description,
      imageDataUrl,
    }: {
      name: string;
      description: string | null;
      imageDataUrl: string;
    }) =>
      authedPost<{ id: string }>(urls.designStudioBackgroundImages, await getAccessToken(), {
        name,
        description,
        image_data_url: imageDataUrl,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.list }),
  });
}

export function useUpdateBackgroundImage() {
  const { getAccessToken } = useBase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description: string | null }) =>
      authedPut<{ id: string }>(urls.designStudioBackgroundImage(id), await getAccessToken(), { name, description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.list }),
  });
}

export function useDeleteBackgroundImage() {
  const { getAccessToken } = useBase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => authedDelete(urls.designStudioBackgroundImage(id), await getAccessToken()),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.list }),
  });
}

// Image content is immutable per id (no edit-in-place of bytes — only name/
// description can change), so — unlike Email Workbench's thumbnails, which ARE
// edited and need version-keyed eviction — these caches never invalidate an
// entry; they only grow for the life of the session. Object URLs are never
// revoked (another tile/view may share the same one).
const thumbCache = new Map<string, Promise<string | null>>();
const imageCache = new Map<string, Promise<string | null>>();

async function loadBlobUrl(url: string, getAccessToken: () => Promise<string>): Promise<string | null> {
  // marketingOpsBackendUrl comes from window.config with no scheme validation —
  // refuse to send the bearer token anywhere but HTTPS rather than trusting a
  // misconfigured (or compromised) config value.
  if (!url.toLowerCase().startsWith("https://")) return null;
  try {
    // redirect: "error" so a compromised or misconfigured backend can't
    // redirect the authenticated request to a non-HTTPS destination either.
    const res = await fetchWithReauth(url, { redirect: "error" }, await getAccessToken());
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new HttpError(url, res.status, body);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function fetchCached(
  cache: Map<string, Promise<string | null>>,
  id: string,
  url: string,
  getAccessToken: () => Promise<string>,
): Promise<string | null> {
  let p = cache.get(id);
  if (!p) {
    p = loadBlobUrl(url, getAccessToken).then((objectUrl) => {
      if (objectUrl === null) cache.delete(id); // don't cache failures — allow a later retry
      return objectUrl;
    });
    cache.set(id, p);
  }
  return p;
}

// Small JPEG derivative — what the library grid tiles render. Cheap even for a full gallery.
export function fetchBackgroundThumbnail(id: string, getAccessToken: () => Promise<string>): Promise<string | null> {
  return fetchCached(thumbCache, id, urls.designStudioBackgroundImageThumbnail(id), getAccessToken);
}

// Full-resolution original — fetched only when a tile is actually picked as the background.
export function fetchBackgroundImage(id: string, getAccessToken: () => Promise<string>): Promise<string | null> {
  return fetchCached(imageCache, id, urls.designStudioBackgroundImageFile(id), getAccessToken);
}
