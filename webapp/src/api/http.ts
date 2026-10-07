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

// Shared HTTP primitives. Every feature slice that fetches from a backend
// should import from here so retry policies, error typing, and Bearer /
// x-jwt-assertion contract stay consistent across the app.
//
// The global QueryClient in AppWithConfig keys its retry logic off
// `HttpError.status`, so features MUST throw HttpError (or subclasses) on
// non-2xx to get the right retry behavior.

import { refreshAccessToken } from "@api/authBridge";
import { classifyToken, noteUnauthorized, resetUnauthorizedOrigins } from "@api/tokenExpiry";

// Thrown on non-2xx responses (and on unexpectedly-empty 2xx GETs). Carries
// the HTTP status so retry logic (both per-query in features and global in
// AppWithConfig) can key off it without regex-parsing the message.
//
// The user-facing `.message` intentionally omits the raw response body —
// backend diagnostics can leak stack traces / internal identifiers and
// this Error can surface in UI error banners. Sanitized body is preserved
// on `.responseBody` for controlled dev logging but never in the message.
export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly responseBody: string;
  constructor(url: string, status: number, body: string) {
    super(`Request failed with HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.responseBody = body;
  }
}

// One-place translator from any thrown value to a user-facing string,
// used by every dialog / notification banner that surfaces a request
// failure. Prefers a well-formed `{message: "..."}` body when the
// backend supplies one, and otherwise falls back to a status-only
// message — the raw `responseBody` is NEVER returned to the UI,
// because backend responses can include stack traces, internal ids,
// gateway HTML pages, etc. The class comment on HttpError above
// documented this intent; we now enforce it in one place instead of
// six near-duplicate copy-pastes across dialog components.
export function humanizeHttpError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.responseBody) {
      try {
        const parsed = JSON.parse(err.responseBody) as { message?: unknown };
        if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
          return parsed.message;
        }
      } catch {
        // Non-JSON body — fall through to the status-only message.
      }
    }
    return `Something went wrong (HTTP ${err.status}).`;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}

// Build the non-auth headers for a request — `extraHeaders` plus
// `Content-Type` for methods that send a JSON body. Does NOT set
// `Authorization`: every caller of this routes through fetchWithReauth,
// which sets that header itself (and is the only place that can, since it
// may need to swap in a freshly-refreshed token on a 401 retry) — so
// computing it here too would just be a value fetchWithReauth immediately
// overwrites and throws away.
function buildHeaders(extraHeaders?: Record<string, string>, withJsonBody?: boolean): Record<string, string> {
  return {
    ...(extraHeaders ?? {}),
    ...(withJsonBody ? { "Content-Type": "application/json" } : {}),
  };
}

// getAccessToken() renews an access_token the SDK sees as expired before
// handing it over, but a request can still carry a dead one: a token read
// moments before it lapsed, or one the IdP revoked early. On a 401
// specifically — never other statuses — try one renewal (dedup'd across
// concurrent callers in @api/authBridge).
//
// A GET is always safe to replay ourselves. Anything else is replayed only
// when the token had already expired when the request was SENT: the gateway
// refuses an expired token before forwarding, so no backend ran the request
// and there is nothing to duplicate. Judged at send time, not at the 401 — a
// token that lapsed while the backend was working may have let the work
// happen first.
//
// Otherwise a 401 doesn't prove a POST/PATCH/DELETE never reached business
// logic — each backend has its own JwtInterceptor in addition to the
// gateway's, and none of the ~15 backends this app talks to support a
// client-supplied idempotency key — so resubmitting a mutation risks a
// duplicate submit/approve/claim if that assumption is ever wrong for one of
// them. For those, still refresh (heals the session for the user's *next*
// attempt) but surface the original 401 rather than replaying it.
//
// If there's no way to refresh (accessors not registered yet, or the
// renewal itself fails — e.g. no live Asgardeo session at all),
// fall back to the original 401 response so the caller's normal
// HttpError/error-banner path handles it, rather than surfacing a
// different failure mode for this one case.
//
// Exported so callers with a non-JSON response shape (binary/blob
// receipts — see @features/finance/util/financeReceipts) can get the
// same retry-on-401 behavior without going through authedGet's JSON
// parsing.
export async function fetchWithReauth(url: string, init: RequestInit, accessToken: string): Promise<Response> {
  const withAuth = (token: string): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
  });
  const sentAt = Date.now();
  const first = await fetch(url, withAuth(accessToken));
  if (first.status !== 401) return first;

  // Whose fault is this 401?
  //
  // Reaching for a silent re-auth on every 401 is what let ONE backend break
  // the whole app: the re-auth attempt failing is what raises the app-wide
  // session-expired dialog, and that dialog is not dismissable. A backend
  // answering 401 for its own reasons — a bad audience, a misconfigured
  // gateway, a bug — could therefore lock every screen, including the ones it
  // has nothing to do with.
  //
  // The token answers it. If it has not expired, our credentials are fine and
  // this 401 belongs to the backend that sent it, so the caller's own error
  // handling should take over untouched.
  //
  // The exception is a token revoked BEFORE it expires (disabled at the IdP, or
  // the session ended there): still live by `exp`, refused by everything. That
  // is what noteUnauthorized corroborates — our credentials being dead is not
  // something one backend knows privately, so two distinct origins refusing
  // within the window re-opens the doubt.
  //
  // "unknown" (an opaque or unreadable token) falls through to the old
  // behaviour deliberately: this check can narrow when re-auth is attempted,
  // never widen it.
  const status = classifyToken(accessToken);
  const corroborated = noteUnauthorized(url);
  if (status.kind === "live" && !corroborated) {
    console.warn(
      `[auth] 401 on ${url} while our access token is still valid ` +
        `(expires ${new Date(status.expiresAt).toISOString()}). Treating this as that ` +
        `backend's rejection, not an expired session — no re-auth attempted.`,
    );
    return first;
  }

  const isReplaySafe =
    (init.method ?? "GET").toUpperCase() === "GET" ||
    classifyToken(accessToken, sentAt).kind === "expired";
  let freshToken: string;
  try {
    // The rejected token goes along so the bridge cannot count it as renewed:
    // a token revoked before its `exp` still reads as live.
    freshToken = await refreshAccessToken(accessToken);
  } catch (error: unknown) {
    // Returning the original 401 is right — the caller's normal error handling
    // takes over. But silently is not: from outside, a request that 401s
    // because the session died looks exactly like one that 401s because the
    // caller lacks the privilege, and only this line tells them apart.
    console.warn(
      `[auth] 401 on ${url} and re-auth failed, so the 401 stands.`,
      error instanceof Error ? error.message : "unknown error",
    );
    return first;
  }
  // The refresh succeeded, so every 401 recorded above belongs to a token that
  // no longer exists. Leaving them in place lets a single 401 under the NEW
  // token reach ORIGINS_BEFORE_DOUBT on the strength of a dead one's evidence,
  // and corroboration is supposed to mean "several backends are refusing the
  // credentials we hold now".
  resetUnauthorizedOrigins();

  if (!isReplaySafe) return first;
  return fetch(url, withAuth(freshToken));
}

// Parse a 2xx response body as JSON. Both the empty-body case (204,
// Content-Length 0, or a Ballerina resource returning `()`) AND a
// non-empty NON-JSON body (a gateway HTML page, a plain-text error page,
// or anything else that isn't well-formed JSON) throw HttpError — so
// callers see the same HttpError.status-keyed retry/handling path they
// see for real 4xx/5xx responses, rather than a bare SyntaxError.
//
// Not currently reachable via any of our documented endpoints (every
// backend response we consume is a typed Ballerina record with a
// non-empty JSON body on success), but the guard exists so an
// intermediate proxy or gateway that decides to answer with an HTML
// error page can't crash a query hook.
async function readJsonOrThrow<T>(res: Response, url: string): Promise<T> {
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    throw new HttpError(url, res.status, "");
  }
  const text = await res.text();
  if (!text) {
    throw new HttpError(url, res.status, "");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(url, res.status, text);
  }
}

// Same behavior for POST/PATCH where an empty response is a legitimate
// "success but no body" — return null. Non-empty non-JSON bodies still
// throw HttpError for the same reason as readJsonOrThrow above.
async function readJsonOrNull<T>(res: Response, url: string): Promise<T | null> {
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(url, res.status, text);
  }
}

async function throwFromError(url: string, res: Response, method: string): Promise<never> {
  const body = await res.text().catch(() => "");
  if (import.meta.env.DEV && body) {
    console.warn(`[${method}] ${url} → HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  throw new HttpError(url, res.status, body);
}

// Authed GET — Bearer <Asgardeo access_token>. Same header shape people-app's
// axios interceptor sets (Choreo's gateway rewrites this into
// x-jwt-assertion for the backend's JwtInterceptor).
//
// No Content-Type header on GET: with no body the header is meaningless
// and makes the request non-simple, forcing an unnecessary CORS preflight.
// `extraHeaders` lets specific callers (e.g. promotion-app / par-app,
// which require `x-user-timezone-offset`) add per-backend quirks without
// polluting the core helper. Authorization isn't set here at all — see
// buildHeaders above — fetchWithReauth applies it after extraHeaders so it
// cannot be silently overridden.
//
// `accessToken` stays a required parameter on purpose — see @hooks/useAccessToken
// for why callers fetch it via the Asgardeo hook rather than this file
// pulling it from @api/authBridge's registered accessor itself. The bridge
// accessor is only safe on the 401-retry path below (fetchWithReauth),
// which by definition runs after a first request already succeeded; making
// it the primary source too would race AuthBridgeMount's registration
// effect on a cold load.
export async function authedGet<T>(
  url: string,
  accessToken: string,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await fetchWithReauth(url, { headers: buildHeaders(extraHeaders) }, accessToken);
  if (!res.ok) await throwFromError(url, res, "authedGet");
  return readJsonOrThrow<T>(res, url);
}

// Authed POST with a JSON body. Returns parsed JSON when the response has
// a body, or null on 201/204. Same error semantics as authedGet.
export async function authedPost<T>(
  url: string,
  accessToken: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T | null> {
  const res = await fetchWithReauth(
    url,
    { method: "POST", headers: buildHeaders(extraHeaders, true), body: JSON.stringify(body) },
    accessToken,
  );
  if (!res.ok) await throwFromError(url, res, "authedPost");
  return readJsonOrNull<T>(res, url);
}

// Authed POST with a JSON body whose RESPONSE is plain text, not JSON —
// currently the People Ops CSV report generator, which streams a whole
// filtered dataset back as text/csv. Kept separate from authedPost rather
// than folded into it with a flag: authedPost's contract is "parsed JSON or
// null", and a CSV body reaching JSON.parse there is an error, not a mode.
//
// Returns the body verbatim (empty string included — a report with no
// matching rows is a legitimately empty result, not a failure). Error
// semantics are identical to authedPost.
export async function authedPostText(
  url: string,
  accessToken: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const res = await fetchWithReauth(
    url,
    { method: "POST", headers: buildHeaders(extraHeaders, true), body: JSON.stringify(body) },
    accessToken,
  );
  if (!res.ok) await throwFromError(url, res, "authedPostText");
  return res.text();
}

// Authed PATCH whose RESPONSE is plain text, not JSON. Same reason
// authedPostText exists: some Ballerina services declare their success as
// `record {| *http:Ok; string body; |}`, where `body` IS the payload — so a
// 200 carries a bare sentence and JSON.parse would reject it.
export async function authedPatchText(
  url: string,
  accessToken: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const res = await fetchWithReauth(
    url,
    { method: "PATCH", headers: buildHeaders(extraHeaders, true), body: JSON.stringify(body) },
    accessToken,
  );
  if (!res.ok) await throwFromError(url, res, "authedPatchText");
  return res.text();
}

// Authed PATCH with a JSON body. Returns parsed JSON when the response has
// a body, or null on 204. Same error semantics as authedPost.
export async function authedPatch<T>(
  url: string,
  accessToken: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T | null> {
  const res = await fetchWithReauth(
    url,
    { method: "PATCH", headers: buildHeaders(extraHeaders, true), body: JSON.stringify(body) },
    accessToken,
  );
  if (!res.ok) await throwFromError(url, res, "authedPatch");
  return readJsonOrNull<T>(res, url);
}

// Authed PUT with a JSON body. Returns parsed JSON when the response has a
// body, or null on 204. Same error semantics as authedPost.
//
// PUT rather than PATCH is a whole-collection REPLACE — the marketing-ops
// settings API works this way (`PUT /api/settings/utm/{parameter}` with the
// complete `entries` array), because the thing being edited is an ordered list
// whose order is meaningful, and a partial patch can't express "these values, in
// this sequence, and nothing else".
export async function authedPut<T>(
  url: string,
  accessToken: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T | null> {
  const res = await fetchWithReauth(
    url,
    { method: "PUT", headers: buildHeaders(extraHeaders, true), body: JSON.stringify(body) },
    accessToken,
  );
  if (!res.ok) await throwFromError(url, res, "authedPut");
  return readJsonOrNull<T>(res, url);
}

// Authed POST with a FormData body (a file upload) — kept separate from
// authedPost rather than folded in with a flag: authedPost's contract is
// "JSON in, JSON or null out", and a FormData body must NOT get the
// `Content-Type: application/json` header buildHeaders(..., true) would add.
// Content-Type is left entirely unset here on purpose: the browser sets
// `multipart/form-data; boundary=...` itself from the FormData instance, and
// setting it manually would drop the boundary and break parsing server-side.
export async function authedUpload<T>(
  url: string,
  accessToken: string,
  formData: FormData,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await fetchWithReauth(url, { method: "POST", headers: buildHeaders(extraHeaders), body: formData }, accessToken);
  if (!res.ok) await throwFromError(url, res, "authedUpload");
  return readJsonOrThrow<T>(res, url);
}

// Shared React Query retry predicate. Skip retries on 4xx (they don't
// improve with a retry — the caller sent a bad request, or the user
// isn't authorized) and retry once on anything else. Kept next to the
// HTTP primitives so every hook's retry story stays consistent with the
// error typing here — before this existed, ~8 hooks each had their own
// copy of this predicate and drifted from the global QueryClient
// policy in AppWithConfig.
//
// Note the global QueryClient policy uses a stricter rule (retry only
// 502/503, up to twice). Per-query retry overrides the global policy,
// so any hook that opts into this predicate deliberately supersedes
// the global — that's the intended contract for the my-page queries,
// which cover a heterogeneous set of backends where transient upstream
// errors can be any 5xx.
export function defaultQueryRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof HttpError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

// Authed DELETE that carries a JSON body, for the rare endpoint whose delete needs
// arguments — CRM Upload's record delete requires a reason, which is written to the
// audit log. Kept separate from `authedDelete` rather than added as a parameter so
// the plain form's signature (and its dozen call sites) stays as it is.
export async function authedDeleteJson<T>(
  url: string,
  accessToken: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T | null> {
  const res = await fetchWithReauth(
    url,
    { method: "DELETE", headers: buildHeaders(extraHeaders, true), body: JSON.stringify(body) },
    accessToken,
  );
  if (!res.ok) await throwFromError(url, res, "authedDeleteJson");
  return readJsonOrNull<T>(res, url);
}

// Authed DELETE. Returns nothing; throws HttpError on non-2xx.
export async function authedDelete(
  url: string,
  accessToken: string,
  extraHeaders?: Record<string, string>,
): Promise<void> {
  const res = await fetchWithReauth(
    url,
    { method: "DELETE", headers: buildHeaders(extraHeaders) },
    accessToken,
  );
  if (!res.ok) await throwFromError(url, res, "authedDelete");
}
