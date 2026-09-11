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

import { Box, OutlinedInput } from '@wso2/oxygen-ui'
import type { PostState, TextColors } from '../../designStudioTypes'
import { FieldLabel, ColorChipRow, HeadlineWeightSelector } from './shared'

const inputSx = { fontSize: '0.82rem', bgcolor: 'background.default', '& fieldset': { borderColor: 'divider' } }

// Quote text color reuses the shared `headline` color field (both quote1 and
// quote2 render with resolveColor('headline')); the attribution title reuses
// `sub` — matching the source tool's buildChips() wiring exactly. Only the
// attribution name (quoteName) has a color field of its own.
export function QuoteFields({ state, textColors, onField, onColorField }: {
  state: PostState
  textColors: TextColors
  onField: (patch: Partial<PostState>) => void
  onColorField: (field: keyof TextColors, color: TextColors[keyof TextColors]) => void
}) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ mb: 1.5 }}>
        <FieldLabel>Quote</FieldLabel>
        <OutlinedInput fullWidth size="small" multiline minRows={2} value={state.quote1}
          placeholder='"WSO2 gave us the flexibility to scale integration without vendor lock-in."'
          onChange={e => onField({ quote1: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
        <OutlinedInput fullWidth size="small" multiline minRows={1} value={state.quote2}
          placeholder="Optional second part (right-aligned)…"
          onChange={e => onField({ quote2: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <HeadlineWeightSelector value={state.headlineWeight} onChange={w => onField({ headlineWeight: w })} />
          </Box>
          <ColorChipRow value={textColors.headline} onChange={c => onColorField('headline', c)} />
        </Box>
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <FieldLabel>Attribution</FieldLabel>
        <OutlinedInput fullWidth size="small" value={state.quoteName} placeholder="Jane Doe"
          onChange={e => onField({ quoteName: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
        <ColorChipRow value={textColors.quoteName} onChange={c => onColorField('quoteName', c)} />
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <FieldLabel>Title / company</FieldLabel>
        <OutlinedInput fullWidth size="small" value={state.quoteTitle} placeholder="CTO, Acme Corp"
          onChange={e => onField({ quoteTitle: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
        <ColorChipRow value={textColors.sub} onChange={c => onColorField('sub', c)} />
      </Box>
    </Box>
  )
}
