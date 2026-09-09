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

// Design Studio → Post Builder: the canvas editor for branded LinkedIn post
// and banner graphics, drawing on the shared background-image library.
//
// PostBuilderEditor is lazy-loaded so its heavy export dependencies (jszip,
// exceljs) stay in their own chunk, not the main bundle every screen pays for.

import { lazy, Suspense } from "react";
import { Box, CircularProgress, Stack, Typography } from "@wso2/oxygen-ui";
import { MARKETING_OPS_EYEBROW } from "@constants/marketingOpsApps";
import MarketingOpsShell from "../../components/MarketingOpsShell";

const PostBuilderEditor = lazy(() =>
  import("../components/PostBuilderEditor").then((m) => ({ default: m.PostBuilderEditor })),
);

function EditorLoading() {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mt: 2 }}>
      <CircularProgress size={16} />
      <Typography variant="body2" color="text.secondary">
        Loading the editor…
      </Typography>
    </Stack>
  );
}

export default function PostBuilderPage() {
  return (
    <MarketingOpsShell
      eyebrow={MARKETING_OPS_EYEBROW.designStudio}
      title="Post Builder"
      subtitle="Design a branded LinkedIn post or banner — pick a post type, fill in the content, choose a background from the shared library, and export ready-to-post PNGs."
    >
      <Box>
        <Suspense fallback={<EditorLoading />}>
          <PostBuilderEditor />
        </Suspense>
      </Box>
    </MarketingOpsShell>
  );
}
