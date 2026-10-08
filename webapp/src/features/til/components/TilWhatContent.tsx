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
import { Typography } from "@wso2/oxygen-ui";
import { sanitizeTilHtml } from "../util/tilRichText";

// Read-only rendering of a submission's `what`, shared by SubmissionCard
// (feed list) and TilEntryPage (the entry's own page) so the two views
// can't drift on how an entry's content looks. Re-sanitizes here too — see
// SubmissionCard's own comment on why the read side never trusts that the
// write side already did.
export default function TilWhatContent({ html, variant = "body2" }: { html: string; variant?: "body2" | "body1" }) {
  return (
    <Typography
      variant={variant}
      sx={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        "& ul, & ol": { pl: "1.5em", my: "0.4em" },
        "& ul > li": { listStyleType: "disc" },
        "& ol > li": { listStyleType: "decimal" },
        "& p": { my: "0.4em" },
        "& img": { maxWidth: "100%", borderRadius: 1, my: "0.5em", display: "block" },
      }}
      dangerouslySetInnerHTML={{ __html: sanitizeTilHtml(html) }}
    />
  );
}
