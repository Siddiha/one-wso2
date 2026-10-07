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
import type { ReactNode } from "react";
import { Alert, Box, Stack, Typography } from "@wso2/oxygen-ui";

// Page frame for Today I Learned — title, subtitle, the "not connected" state,
// and a right-aligned slot for the "New entry" action. Same shape as
// MenuShell; see that file's header for why there's no eyebrow chip above
// the title.
export default function TilShell({
  title,
  subtitle,
  configured,
  configKey,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  configured: boolean;
  configKey: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography component="h1" variant="h4" fontWeight={700}>
          {title}
        </Typography>
        {configured && action}
      </Stack>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: "70ch" }}>
          {subtitle}
        </Typography>
      )}

      {configured ? (
        children
      ) : (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          This app isn&apos;t connected yet. Set <code>{configKey}</code> in{" "}
          <code>public/config.js</code> (the backend URL) and reload.
        </Alert>
      )}
    </Box>
  );
}
