/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Which reader each attachment surface uses.
 *
 * There are two, and they are not interchangeable:
 *
 * - `fetchBase64Attachment` decodes base64 TEXT. The cc backend returns
 *   `{body: fileContent.toBase64()}` (service.bal:592) under
 *   `record {| *http:Ok; string body; |}`, so the payload is a base64 string.
 * - `fetchReceiptObjectUrl` reads raw BYTES into a Blob. Expense and OPD
 *   stream the file itself.
 *
 * Cc's details dialog used the blob reader while cc's grid used the base64 one
 * — the same endpoint read two ways. The dialog's preview therefore opened a
 * file whose contents were the literal base64 string. Nothing caught it
 * because the choice is a single import and no test named it.
 */
/**
 * The import line only — the whole file would also match a comment that
 * names the other reader while explaining why it is not used here.
 */
function importedReaders(p: string): string {
  const src = readFileSync(join(__dirname, "..", p), "utf8");
  return src
    .split("\n")
    .filter((l) => l.startsWith("import") && l.includes("financeReceipts"))
    .join(" ");
}

describe("every cc attachment surface decodes base64", () => {
  it.each([
    "cc/CcTxnDetailsDialog.tsx",
    "cc/CcTxnTable.tsx",
    "cc/pages/CcHistoryPage.tsx",
    // The categorise panel opens attachments on both Pending Submissions and
    // Pending Approvals, so it is a cc attachment surface like the rest.
    "cc/CcCategorisePanel.tsx",
  ])("%s", (file) => {
    const imports = importedReaders(file);
    expect(imports).toContain("fetchBase64Attachment");
    expect(imports).not.toContain("fetchReceiptObjectUrl");
  });
});

describe("expense and OPD still read bytes", () => {
  it.each([
    "expense/ExpenseClaimDetailsDialog.tsx",
    "opd/OpdClaimDetailsDialog.tsx",
  ])("%s", (file) => {
    const imports = importedReaders(file);
    expect(imports).toContain("fetchReceiptObjectUrl");
    expect(imports).not.toContain("fetchBase64Attachment");
  });
});
