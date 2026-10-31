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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authedDelete, authedPatchText, authedPostText, fetchWithReauth, HttpError } from "@api/http";
import { useAccessToken } from "@hooks/useAccessToken";
import { ccServiceUrls } from "@config/apiConfig";
import { fileExtension, putBinaryFile } from "../util/financeReceipts";
import type { CcAttachmentType, CcTransaction, CcTransactionUploadGroup } from "./ccTypes";

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["cc-transactions"] }),
    qc.invalidateQueries({ queryKey: ["cc-cards"] }),
  ]);
}

// Every write below reads its response as TEXT, not JSON.
//
// The backend declares these successes as `record {| *http:Ok; string body; |}`
// (types.bal:91-93, :129-131), where `body` is the HTTP payload — so a 200
// carries a bare sentence like "Successfully submitted 3 credit card
// transaction(s) for lead approval." `authedPost` runs that through JSON.parse
// and throws, which reported every successful submit, save, approve and rename
// to the reader as a failure after the work had already been done.
//
// The same misreading of Ballerina's `string body` cost us the attachment
// upload (see putBinaryFile). It comes from porting against the backend's type
// instead of the running app, which just resolves response.data.

// POST /transactions/employee-submit — a CC owner submits categorised `new`
// transactions for lead approval.
export function useCcEmployeeSubmit() {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  return useMutation<void, Error, CcTransaction[]>({
    mutationFn: async (transactions) => {
      const accessToken = await getAccessToken();
      await authedPostText(ccServiceUrls.employeeSubmit, accessToken, transactions);
    },
    onSuccess: () => invalidate(qc),
  });
}

// POST /transactions/save-draft — keep a part-finished categorisation.
//
// transaction.ts:29 maps UpdateType.tempSave to this path. The endpoint was
// already in apiConfig and nothing called it, so a reader who categorised a
// batch and left the page lost all of it: the port held the edits in component
// state and posted nothing until Submit. EditPane.tsx:444-467 saves five
// seconds after the last change instead.
//
// Deliberately no cache invalidation: a draft save must not refetch the list
// mid-edit and replace the rows being worked on.
export function useCcSaveDraft() {
  const getAccessToken = useAccessToken();
  return useMutation<void, Error, CcTransaction[]>({
    mutationFn: async (transactions) => {
      const accessToken = await getAccessToken();
      await authedPostText(ccServiceUrls.saveDraft, accessToken, transactions);
    },
  });
}

/**
 * POST /transactions/card-lead-reminder — email one card lead the unsubmitted
 * backlog of the card holders they approve for, copying those card holders and
 * the caller.
 *
 * Sends only the lead and the date range, never the message. The dashboard holds
 * its summary for five minutes, so a body built here could chase a card holder
 * who has already submitted; the backend reads the figures at send time instead.
 *
 * Nothing here or on the backend records that a reminder has gone out, so this
 * can be called again for the same lead as a second or third follow-up.
 */
export function useCcCardLeadReminder() {
  const getAccessToken = useAccessToken();
  return useMutation<string, Error, { leadEmail: string; dateFrom?: string }>({
    mutationFn: async ({ leadEmail, dateFrom }) => {
      const accessToken = await getAccessToken();
      return authedPostText(ccServiceUrls.cardLeadReminder, accessToken, {
        leadEmail,
        dateFrom: dateFrom ?? null,
      });
    },
  });
}

// POST /transactions/save-edit — edit categorisation while still pending.
export function useCcSaveEdit() {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  return useMutation<void, Error, CcTransaction[]>({
    mutationFn: async (transactions) => {
      const accessToken = await getAccessToken();
      await authedPostText(ccServiceUrls.saveEdit, accessToken, transactions);
    },
    onSuccess: () => invalidate(qc),
  });
}

// POST /transactions/lead-approve | /transactions/finance-approve — body is
// an array of transaction ids.
export function useCcApprove(stage: "lead" | "finance") {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  return useMutation<void, Error, number[]>({
    mutationFn: async (ids) => {
      const accessToken = await getAccessToken();
      const url = stage === "lead" ? ccServiceUrls.leadApprove : ccServiceUrls.financeApprove;
      await authedPostText(url, accessToken, ids);
    },
    onSuccess: () => invalidate(qc),
  });
}

// Attachment upload (PUT raw bytes) + delete for a transaction's receipt or
// contract. Returns the stored file name from the upload.
/**
 * PATCH /credit-cards/{id}?label= — rename a card. creditCard.ts:89-107; the
 * source's own success wording is "Successfully updated the label".
 */
export function useCcCardLabel() {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  return useMutation<void, Error, { id: number; label: string }>({
    mutationFn: async ({ id, label }) => {
      const accessToken = await getAccessToken();
      // The label rides in the query string, as the source sends it; there is
      // no body.
      await authedPatchText(ccServiceUrls.creditCardLabel(id, label), accessToken, {});
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["cc-cards"] });
    },
  });
}

export function useCcAttachment() {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  const upload = useMutation<string, Error, { id: number; attachmentType: CcAttachmentType; file: File }>({
    mutationFn: async ({ id, attachmentType, file }) => {
      const accessToken = await getAccessToken();
      const url = ccServiceUrls.attachmentUpload(id, fileExtension(file), attachmentType);
      return putBinaryFile(url, accessToken, file);
    },
    onSuccess: () => invalidate(qc),
  });
  const remove = useMutation<void, Error, { id: number; attachmentType: CcAttachmentType }>({
    mutationFn: async ({ id, attachmentType }) => {
      const accessToken = await getAccessToken();
      await authedDelete(ccServiceUrls.attachment(id, attachmentType), accessToken);
    },
    onSuccess: () => invalidate(qc),
  });
  return { upload, remove };
}

// POST /transactions/process-statement — finance uploads a CSV; backend
// parses it into new/duplicate/invalid groups (raw text/csv body).
export function useCcProcessStatement() {
  const getAccessToken = useAccessToken();
  return useMutation<CcTransactionUploadGroup, Error, { bankCode: string; fileName: string; file: File }>({
    mutationFn: async ({ bankCode, fileName, file }) => {
      const accessToken = await getAccessToken();
      const url = ccServiceUrls.processStatement(bankCode, fileName);
      const res = await fetchWithReauth(
        url,
        { method: "POST", headers: { "Content-Type": "text/csv" }, body: file },
        accessToken,
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new HttpError(url, res.status, body);
      }
      return (await res.json()) as CcTransactionUploadGroup;
    },
  });
}

// POST /transactions — finance saves the reviewed group, creating pending
// transactions.
export function useCcUploadTransactions() {
  const getAccessToken = useAccessToken();
  const qc = useQueryClient();
  return useMutation<void, Error, { bankCode: string; fileName: string; group: CcTransactionUploadGroup }>({
    mutationFn: async ({ bankCode, fileName, group }) => {
      const accessToken = await getAccessToken();
      await authedPostText(ccServiceUrls.uploadTransactions(bankCode, fileName), accessToken, group);
    },
    onSuccess: () => invalidate(qc),
  });
}
