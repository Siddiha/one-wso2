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

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { authedGet } from "@api/http";
import { cado2Pdf, cado2Send } from "@features/sales/cado2/api/cado2Http";
import { problemOf } from "./errors";
import { httpRetry } from "@api/errors";
import { cado2ServiceUrls } from "@config/apiConfig";
import { useCado2Basis } from "@features/sales/cado2/api/cado2Basis";
import type {
  Account,
  ActiveLegalEntity,
  Contact,
  DeleteDraftResult,
  DocumentsView,
  DocumentView,
  DraftInput,
  DraftResponse,
  Issue,
  Opportunity,
  PricebookOption,
  PricingPreview,
  Product,
  AuditEvent,
  QuoteList,
  QuoteSettings,
  QuoteView,
} from "./quoteTypes";

/** Account search needs at least this many characters (backend rule). */
export const MIN_ACCOUNT_SEARCH = 3;

// Lookups change rarely during a session; five minutes avoids re-fetching
// every time the rep moves between steps.
const LOOKUP_STALE_MS = 5 * 60 * 1000;

/**
 * How fresh a query must be:
 * - "lookup": reference data; cached for five minutes, and (the app default)
 *   not re-fetched when a page opens.
 * - "live": quote data; re-fetched every time a page opens. A quote changes
 *   as soon as it is saved, submitted or recalled on another screen, and the
 *   app-wide `refetchOnMount: false` would otherwise keep showing the copy
 *   from before (found 2026-09-25: a submitted quote still showed as Draft).
 */
type Freshness = "lookup" | "live";

function useAuthedQuery<T>(
  parts: readonly unknown[],
  url: string | null,
  freshness: Freshness = "lookup",
): UseQueryResult<T, Error> {
  const { getToken, ready, key } = useCado2Basis();
  return useQuery<T, Error>({
    queryKey: key(...parts),
    queryFn: async () => authedGet<T>(url as string, await getToken()),
    enabled: ready && url !== null,
    // Set only for live data: an explicit `refetchOnMount: undefined` would
    // override the app default rather than fall back to it.
    ...(freshness === "live" ? { staleTime: 0, refetchOnMount: "always" as const } : { staleTime: LOOKUP_STALE_MS }),
    retry: httpRetry,
  });
}

/** Accounts whose name contains `term` (off below 3 characters). */
export function useAccountSearch(term: string) {
  const t = term.trim();
  return useAuthedQuery<Account[]>(["accounts", t], t.length >= MIN_ACCOUNT_SEARCH ? cado2ServiceUrls.accounts(t) : null);
}

/** Open opportunities to quote (the default), or closed-won ones for a renewal to renew. */
export function useAccountOpportunities(accountId: string | null, status: "open" | "won" = "open") {
  return useAuthedQuery<Opportunity[]>(
    ["account-opportunities", accountId, status],
    accountId ? cado2ServiceUrls.accountOpportunities(accountId, status) : null,
  );
}

export function useAccountContacts(accountId: string | null) {
  return useAuthedQuery<Contact[]>(
    ["account-contacts", accountId],
    accountId ? cado2ServiceUrls.accountContacts(accountId) : null,
  );
}

/** How many products one page of the Add-line list loads. */
export const PRODUCT_PAGE = 50;

/**
 * The products of the quote's price book (the opportunity's), by name,
 * a page at a time, each with that book's price only. A page shorter
 * than PRODUCT_PAGE is the last one.
 */
export function useProducts(currency: string, term: string, pricebookId: string) {
  const t = term.trim();
  const { getToken, ready, key } = useCado2Basis();
  return useInfiniteQuery<Product[], Error, Product[], readonly unknown[], number>({
    queryKey: key("products", currency, t, pricebookId),
    queryFn: async ({ pageParam }) =>
      authedGet<Product[]>(
        cado2ServiceUrls.products(currency, t, { pricebookId, limit: PRODUCT_PAGE, offset: pageParam }),
        await getToken(),
      ),
    initialPageParam: 0,
    // The backend pages up to offset 2000 (Salesforce's cap).
    getNextPageParam: (last, pages) =>
      last.length < PRODUCT_PAGE || pages.length * PRODUCT_PAGE > 2000 ? undefined : pages.length * PRODUCT_PAGE,
    select: (data) => data.pages.flat(),
    enabled: ready && currency !== "" && pricebookId !== "",
    staleTime: LOOKUP_STALE_MS,
    retry: httpRetry,
  });
}

/** The price books with prices in the currency, for the quote's price book. */
export function usePricebooks(currency: string) {
  return useAuthedQuery<PricebookOption[]>(["pricebooks", currency], currency ? cado2ServiceUrls.pricebooks(currency) : null);
}

export function useCurrencies() {
  return useAuthedQuery<string[]>(["currencies"], cado2ServiceUrls.currencies);
}

/** The quote rules shown ahead of time, e.g. the validity period. */
export function useQuoteSettings() {
  return useAuthedQuery<QuoteSettings>(["quote-settings"], cado2ServiceUrls.quoteSettings);
}

export function useActiveLegalEntities() {
  return useAuthedQuery<ActiveLegalEntity[]>(["legal-entities", "active"], cado2ServiceUrls.legalEntities(true));
}

/** My Quotes: the caller's own quotes, filtered by the latest version's status. */
export function useQuoteList(status = "") {
  return useAuthedQuery<QuoteList>(["quotes", "list", status], cado2ServiceUrls.quoteList(status), "live");
}

/** A quote with its version list and the caller's actions. */
export function useQuote(quoteId: number | null) {
  return useAuthedQuery<QuoteView>(["quotes", "one", quoteId], quoteId ? cado2ServiceUrls.quote(quoteId) : null, "live");
}

/** A quote's history, oldest first. */
export function useAuditEvents(quoteId: number | null) {
  return useAuthedQuery<AuditEvent[]>(["quotes", "history", quoteId], quoteId ? cado2ServiceUrls.quoteAuditEvents(quoteId) : null, "live");
}

export function useQuoteVersion(quoteId: number | null, version: number | null) {
  return useAuthedQuery<DraftResponse>(
    ["quote-version", quoteId, version],
    quoteId && version ? cado2ServiceUrls.quoteVersion(quoteId, version) : null,
    "live",
  );
}

/** Outcome of a live preview: priced, or the problems that stop pricing. */
export type PreviewResult =
  { kind: "priced"; preview: PricingPreview } | { kind: "problems"; issues: readonly Issue[] };

/**
 * Live pricing for the summary panel. `body` is null until there is enough
 * to price (term, currency, billing, at least one line). Keeps the previous
 * result while a new one loads so the numbers don't flicker.
 */
export function usePricingPreview(body: unknown | null) {
  const { getToken, ready, key } = useCado2Basis();
  return useQuery<PreviewResult, Error>({
    queryKey: key("pricing-preview", body),
    queryFn: async () => {
      try {
        const preview = await cado2Send<PricingPreview>("POST", cado2ServiceUrls.pricingPreview, await getToken(), body);
        return { kind: "priced", preview };
      } catch (err) {
        const problem = problemOf(err);
        if (problem) return { kind: "problems", issues: problem.issues };
        throw err;
      }
    },
    enabled: ready && body !== null,
    placeholderData: keepPreviousData,
    retry: httpRetry,
  });
}

/** Creates the quote (first save) or saves the draft. */
export function useSaveDraft() {
  const { getToken, key } = useCado2Basis();
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, Error, { quoteId: number | null; version: number | null; input: DraftInput }>({
    mutationFn: async ({ quoteId, version, input }) =>
      quoteId && version
        ? cado2Send<DraftResponse>("PUT", cado2ServiceUrls.quoteVersion(quoteId, version), await getToken(), input)
        : cado2Send<DraftResponse>("POST", cado2ServiceUrls.quotes, await getToken(), input),
    onSuccess: (res) => {
      queryClient.setQueryData(key("quote-version", res.quote.id, res.version.versionNumber), res);
      void queryClient.invalidateQueries({ queryKey: key("quotes") });
    },
  });
}

/**
 * The lifecycle actions. Each answers with the affected version, which
 * is cached; the quote, the lists and the history are refetched.
 */
function useLifecycleAction<V>(send: (vars: V, token: string) => Promise<DraftResponse>) {
  const { getToken, key } = useCado2Basis();
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, Error, V>({
    mutationFn: async (vars) => send(vars, await getToken()),
    onSuccess: (res) => {
      queryClient.setQueryData(key("quote-version", res.quote.id, res.version.versionNumber), res);
      void queryClient.invalidateQueries({ queryKey: key("quotes") });
      void queryClient.invalidateQueries({ queryKey: key("quote-version", res.quote.id) });
    },
  });
}

export function useRecallVersion() {
  return useLifecycleAction<{ quoteId: number; version: number; reason: string }>(({ quoteId, version, reason }, token) =>
    cado2Send<DraftResponse>("POST", cado2ServiceUrls.quoteRecall(quoteId, version), token, reason.trim() ? { reason } : {}),
  );
}

export function useReviseQuote() {
  return useLifecycleAction<{ quoteId: number }>(({ quoteId }, token) =>
    cado2Send<DraftResponse>("POST", cado2ServiceUrls.quoteRevise(quoteId), token, {}),
  );
}

/**
 * Deletes the latest version while it is a draft. With no other
 * version the quote goes too; otherwise the previous version is cached as the latest.
 */
export function useDeleteDraft() {
  const { getToken, key } = useCado2Basis();
  const queryClient = useQueryClient();
  return useMutation<DeleteDraftResult, Error, { quoteId: number; version: number; expectedUpdatedAt: string }>({
    mutationFn: async ({ quoteId, version, expectedUpdatedAt }) =>
      cado2Send<DeleteDraftResult>("DELETE", cado2ServiceUrls.quoteVersion(quoteId, version), await getToken(), { expectedUpdatedAt }),
    onSuccess: (res, { quoteId, version }) => {
      queryClient.removeQueries({ queryKey: key("quote-version", quoteId, version) });
      if (res.latest) {
        queryClient.setQueryData(key("quote-version", quoteId, res.latest.version.versionNumber), res.latest);
      } else {
        queryClient.removeQueries({ queryKey: key("quotes", "one", quoteId) });
        queryClient.removeQueries({ queryKey: key("quotes", "history", quoteId) });
      }
      void queryClient.invalidateQueries({ queryKey: key("quotes") });
    },
  });
}

export function useCloseQuote() {
  return useLifecycleAction<{ quoteId: number; reason: string }>(({ quoteId, reason }, token) =>
    cado2Send<DraftResponse>("POST", cado2ServiceUrls.quoteClose(quoteId), token, { reason }),
  );
}

/** Submits a draft version, freezing it. */
export function useSubmitVersion() {
  const { getToken, key } = useCado2Basis();
  const queryClient = useQueryClient();
  return useMutation<DraftResponse, Error, { quoteId: number; version: number; expectedUpdatedAt: string }>({
    mutationFn: async ({ quoteId, version, expectedUpdatedAt }) =>
      cado2Send<DraftResponse>("POST", cado2ServiceUrls.quoteSubmit(quoteId, version), await getToken(), { expectedUpdatedAt }),
    onSuccess: (res) => {
      queryClient.setQueryData(key("quote-version", res.quote.id, res.version.versionNumber), res);
      void queryClient.invalidateQueries({ queryKey: key("quotes") });
    },
  });
}

// ---------------------------------------------------------------------------
// Order form documents
// ---------------------------------------------------------------------------

/** A version's documents and whether the order form can be previewed or issued. */
export function useDocuments(quoteId: number | null, version: number | null, enabled: boolean) {
  return useAuthedQuery<DocumentsView>(
    ["quotes", "documents", quoteId, version],
    enabled && quoteId && version ? cado2ServiceUrls.quoteDocuments(quoteId, version) : null,
    "live",
  );
}

/** Issues the order form: the PDF is produced and stored, and the expiry starts. */
export function useIssueOrderForm() {
  const { getToken, key } = useCado2Basis();
  const queryClient = useQueryClient();
  return useMutation<DocumentView, Error, { quoteId: number; version: number }>({
    mutationFn: async ({ quoteId, version }) =>
      cado2Send<DocumentView>("POST", cado2ServiceUrls.quoteDocuments(quoteId, version), await getToken(), {}),
    onSuccess: (_, { quoteId, version }) => {
      void queryClient.invalidateQueries({ queryKey: key("quotes") });
      void queryClient.invalidateQueries({ queryKey: key("quote-version", quoteId, version) });
    },
  });
}

/** Fetches the preview PDF (never stored) and issued PDFs, as Blobs. */
export function useDocumentFiles() {
  const { getToken } = useCado2Basis();
  return {
    preview: async (quoteId: number, version: number) =>
      cado2Pdf("POST", cado2ServiceUrls.quoteOrderFormPreview(quoteId, version), await getToken()),
    download: async (quoteId: number, documentId: number) =>
      cado2Pdf("GET", cado2ServiceUrls.quoteDocumentFile(quoteId, documentId), await getToken()),
  };
}
