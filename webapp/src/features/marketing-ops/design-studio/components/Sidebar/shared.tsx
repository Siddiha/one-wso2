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

// Small controls reused across several sidebar field groups: the 4-swatch
// color chip row (tag/headline/sub/body/quoteName/eventHeadline/eventSub each
// get their own instance), and the Bold/Semibold/Medium weight selector
// (shown once per type's content group, all bound to the same
// state.headlineWeight — the source tool repeats this control near whichever
// text block it affects rather than centralizing it once).
//
// These color swatches are literal brand-asset colors (COLORS in
// postBuilderCore.ts), not the app's own design tokens — the control chrome
// itself (border, sizing, hit target) follows the platform style guide; only
// the swatch fill is the canvas's own brand palette.

import { Box, Typography } from '@wso2/oxygen-ui'
import { CHIP_DEFS, COLORS, HEADLINE_WEIGHT_OPTS } from '../postBuilderCore'
import type { ColorKey } from '../../designStudioTypes'

export const labelSx = {
  fontSize: '0.66rem', fontWeight: 700, color: 'text.secondary',
  textTransform: 'uppercase' as const, letterSpacing: '0.04em', mb: 0.75,
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Typography sx={labelSx}>{children}</Typography>
}

export function ColorChipRow({ value, onChange }: { value: ColorKey; onChange: (c: ColorKey) => void }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75 }}>
      {CHIP_DEFS.map(d => (
        <Box
          key={d.k} component="button" type="button" title={d.title} aria-label={d.title} aria-pressed={value === d.k} onClick={() => onChange(d.k)}
          sx={{
            width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', p: 0,
            bgcolor: COLORS[d.k],
            border: '2px solid', borderColor: value === d.k ? 'text.primary' : 'divider',
            transition: 'transform .1s, border-color .15s',
            '&:hover': { transform: 'scale(1.1)' },
          }}
        />
      ))}
    </Box>
  )
}

export function HeadlineWeightSelector({ value, onChange }: { value: number; onChange: (w: 800 | 600 | 500) => void }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.5 }}>
      {HEADLINE_WEIGHT_OPTS.map(opt => (
        <Box
          key={opt.w} component="button" type="button" onClick={() => onChange(opt.w)}
          sx={{
            py: 0.75, px: 0.5, borderRadius: '6px', cursor: 'pointer', textAlign: 'center',
            fontSize: '0.7rem', fontWeight: opt.w, fontFamily: 'inherit',
            border: '1px solid', borderColor: value === opt.w ? 'primary.main' : 'divider',
            bgcolor: value === opt.w ? 'action.selected' : 'background.default',
            color: value === opt.w ? 'primary.main' : 'text.secondary',
          }}
        >
          {opt.label}
        </Box>
      ))}
    </Box>
  )
}
