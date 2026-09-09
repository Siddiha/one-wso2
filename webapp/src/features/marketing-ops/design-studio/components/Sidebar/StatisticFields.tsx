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

import { Box, Switch, Typography } from '@wso2/oxygen-ui'
import { OutlinedInput } from '@wso2/oxygen-ui'
import type { PostState, TextColors } from '../../designStudioTypes'
import { FieldLabel, ColorChipRow, HeadlineWeightSelector } from './shared'

const inputSx = { fontSize: '0.82rem', bgcolor: 'background.default', '& fieldset': { borderColor: 'divider' } }

export function StatisticFields({ state, textColors, onField, onColorField }: {
  state: PostState
  textColors: TextColors
  onField: (patch: Partial<PostState>) => void
  onColorField: (field: keyof TextColors, color: TextColors[keyof TextColors]) => void
}) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ mb: 1.5 }}>
        <FieldLabel>Lead-in</FieldLabel>
        <OutlinedInput fullWidth size="small" value={state.statLeadin}
          onChange={e => onField({ statLeadin: e.target.value })} sx={inputSx} />
      </Box>
      <Box sx={{ mb: 1.5 }}>
        <FieldLabel>Number</FieldLabel>
        <OutlinedInput fullWidth size="small" value={state.statNumber} placeholder="70%"
          onChange={e => onField({ statNumber: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <HeadlineWeightSelector value={state.headlineWeight} onChange={w => onField({ headlineWeight: w })} />
          </Box>
          <ColorChipRow value={textColors.headline} onChange={c => onColorField('headline', c)} />
        </Box>
      </Box>
      <Box sx={{ mb: 1.5 }}>
        <FieldLabel>Label</FieldLabel>
        <OutlinedInput fullWidth size="small" value={state.statLabel}
          onChange={e => onField({ statLabel: e.target.value })} sx={inputSx} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>Add a second stat</Typography>
        <Switch size="small" checked={state.statTwoUp} onChange={e => onField({ statTwoUp: e.target.checked })} />
      </Box>
      {state.statTwoUp && (
        <>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Second number</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.statNumber2}
              onChange={e => onField({ statNumber2: e.target.value })} sx={inputSx} />
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Second label</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.statLabel2}
              onChange={e => onField({ statLabel2: e.target.value })} sx={inputSx} />
          </Box>
        </>
      )}
    </Box>
  )
}
