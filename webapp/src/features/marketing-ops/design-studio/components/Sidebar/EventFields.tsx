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

import { useMemo, useRef } from 'react'
import { Box, Button, OutlinedInput, Typography } from '@wso2/oxygen-ui'
import { XIcon } from '@wso2/oxygen-ui-icons-react'
import { EVENT_FORMAT_OPTS, imageToDataURL } from '../postBuilderCore'
import type { PostState, TextColors } from '../../designStudioTypes'
import { FieldLabel, ColorChipRow, HeadlineWeightSelector } from './shared'

const inputSx = { fontSize: '0.82rem', bgcolor: 'background.default', '& fieldset': { borderColor: 'divider' } }

export function EventFields({ state, textColors, onField, onColorField, onPartnerLogoFile, onClearPartnerLogo }: {
  state: PostState
  textColors: TextColors
  onField: (patch: Partial<PostState>) => void
  onColorField: (field: keyof TextColors, color: TextColors[keyof TextColors]) => void
  onPartnerLogoFile: (file: File) => void
  onClearPartnerLogo: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  // Memoized: see ContentFields.tsx's customerLogoPreview for why (canvas.toDataURL
  // shouldn't rerun on every keystroke in an unrelated field).
  const partnerPreview = useMemo(() => state.partnerLogo ? imageToDataURL(state.partnerLogo) : null, [state.partnerLogo])

  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ mb: 1.5 }}>
        <FieldLabel>Format</FieldLabel>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
          {EVENT_FORMAT_OPTS.map(opt => (
            <Box
              key={opt.id} component="button" type="button" onClick={() => onField({ eventFormat: opt.id })}
              sx={{
                py: 0.75, px: 0.5, borderRadius: '6px', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
                fontSize: '0.7rem', fontWeight: state.eventFormat === opt.id ? 700 : 500,
                border: '1px solid', borderColor: state.eventFormat === opt.id ? 'primary.main' : 'divider',
                bgcolor: state.eventFormat === opt.id ? 'action.selected' : 'background.default',
                color: state.eventFormat === opt.id ? 'primary.main' : 'text.secondary',
              }}
            >
              {opt.label}
            </Box>
          ))}
        </Box>
      </Box>

      {state.eventFormat === 'icons' ? (
        <>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Headline</FieldLabel>
            <OutlinedInput fullWidth size="small" multiline minRows={2} value={state.eventHeadline}
              onChange={e => onField({ eventHeadline: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ flex: 1 }}>
                <HeadlineWeightSelector value={state.headlineWeight} onChange={w => onField({ headlineWeight: w })} />
              </Box>
              <ColorChipRow value={textColors.eventHeadline} onChange={c => onColorField('eventHeadline', c)} />
            </Box>
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Sub-headline</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.eventSub}
              onChange={e => onField({ eventSub: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
            <ColorChipRow value={textColors.eventSub} onChange={c => onColorField('eventSub', c)} />
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Date</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.eventDate} placeholder="12 May 2026"
              onChange={e => onField({ eventDate: e.target.value })} sx={inputSx} />
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Time</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.eventTime} placeholder="10:00 AM"
              onChange={e => onField({ eventTime: e.target.value })} sx={inputSx} />
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Location (one line per row)</FieldLabel>
            <OutlinedInput fullWidth size="small" multiline minRows={2} value={state.eventLocation}
              onChange={e => onField({ eventLocation: e.target.value })} sx={inputSx} />
          </Box>
        </>
      ) : (
        <>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Partner logo</FieldLabel>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {partnerPreview && (
                <Box component="img" src={partnerPreview} alt="" sx={{ height: 32, filter: 'invert(1)', bgcolor: '#0D1B2E', borderRadius: '4px', p: 0.5 }} />
              )}
              <input ref={fileRef} type="file" accept="image/png,image/webp,image/svg+xml" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) onPartnerLogoFile(f); e.target.value = '' }} />
              <Button size="small" variant="outlined" onClick={() => fileRef.current?.click()} sx={{ textTransform: 'none' }}>
                {partnerPreview ? 'Replace' : 'Upload partner logo'}
              </Button>
              {partnerPreview && (
                <Button size="small" onClick={onClearPartnerLogo} startIcon={<XIcon size={14} />} sx={{ textTransform: 'none', color: 'text.secondary' }}>
                  Remove
                </Button>
              )}
            </Box>
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Kicker</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.eventKicker} placeholder="See us at"
              onChange={e => onField({ eventKicker: e.target.value })} sx={inputSx} />
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Event name</FieldLabel>
            <OutlinedInput fullWidth size="small" multiline minRows={2} value={state.eventName}
              onChange={e => onField({ eventName: e.target.value })} sx={{ ...inputSx, mb: 0.75 }} />
            <HeadlineWeightSelector value={state.headlineWeight} onChange={w => onField({ headlineWeight: w })} />
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Venue</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.eventVenue}
              onChange={e => onField({ eventVenue: e.target.value })} sx={inputSx} />
          </Box>
          <Box sx={{ mb: 1.5 }}>
            <FieldLabel>Dates</FieldLabel>
            <OutlinedInput fullWidth size="small" value={state.eventDates}
              onChange={e => onField({ eventDates: e.target.value })} sx={inputSx} />
          </Box>
        </>
      )}
      <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled' }}>
        No pulse icon or tag on Event posts — the WSO2 mark appears in the format's own layout instead.
      </Typography>
    </Box>
  )
}
