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

// Page frame for the org chart: eyebrow chip, title, subtitle, and the one
// place the "backend not connected" state is rendered. Same arrangement as
// MenuShell / the finance shell — each feature owns its own copy of this.

import type { ReactNode } from "react";
import { Alert, Box, Chip, Typography } from "@wso2/oxygen-ui";
import type { LucideIcon } from "@wso2/oxygen-ui-icons-react";

export default function OrgChartShell({
  eyebrow,
  title,
  subtitle,
  configured,
  configKey,
  action,
  children,
}: {
  eyebrow: { icon: LucideIcon; label: string };
  title: string;
  subtitle?: string;
  configured: boolean;
  configKey: string;
  /** Rendered top-right, alongside the title — e.g. the Download button.
   *  Only shown once the backend is configured; there's nothing to act on
   *  in the not-connected state. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Chip
            icon={<eyebrow.icon size={14} />}
            label={eyebrow.label}
            color="primary"
            variant="outlined"
            size="small"
            sx={{ mb: 0.5 }}
          />
          <Typography component="h1" variant="h5" sx={{ mb: 0.5 }}>
            {title}
          </Typography>
        </Box>
        {configured && action && <Box sx={{ flexShrink: 0, mt: 0.5 }}>{action}</Box>}
      </Box>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.25, maxWidth: "70ch" }}>
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
