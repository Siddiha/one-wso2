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
import { ICON_COLOR_OPTS, LOGO_OPTS } from '../postBuilderCore'
import type { IconColor, LogoColor, LogoPos } from '../../designStudioTypes'
import { FieldLabel } from './shared'

function ColorDot({ color, active, onClick, title }: { color: string; active: boolean; onClick: () => void; title: string }) {
  return (
    <Box
      component="button" type="button" onClick={onClick} title={title}
      sx={{
        width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', p: 0, bgcolor: color,
        border: color === '#0D0D0D' ? '1px solid rgba(255,255,255,0.3)' : '2px solid transparent',
        boxShadow: active ? '0 0 0 1.5px #F14E23' : 'none',
        transition: 'transform .1s',
        '&:hover': { transform: 'scale(1.1)' },
      }}
    />
  )
}

export function LogoIconSection({ logoPos, logoColor, iconOn, iconColor, onLogoPosChange, onLogoColorChange, onIconToggle, onIconColorChange }: {
  logoPos: LogoPos
  logoColor: LogoColor
  iconOn: boolean
  iconColor: IconColor
  onLogoPosChange: (pos: LogoPos) => void
  onLogoColorChange: (color: LogoColor) => void
  onIconToggle: (on: boolean) => void
  onIconColorChange: (color: IconColor) => void
}) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <FieldLabel>WSO2 logo</FieldLabel>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, mb: 1 }}>
        {LOGO_OPTS.map(opt => (
          <Box
            key={opt.id} component="button" type="button" onClick={() => onLogoPosChange(opt.id)}
            sx={{
              py: 0.75, px: 0.5, borderRadius: '6px', cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
              fontSize: '0.72rem', fontWeight: logoPos === opt.id ? 700 : 500,
              border: '1px solid', borderColor: logoPos === opt.id ? 'primary.main' : 'divider',
              bgcolor: logoPos === opt.id ? 'action.selected' : 'background.default',
              color: logoPos === opt.id ? 'primary.main' : 'text.secondary',
            }}
          >
            {opt.label}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, ml: 0.5 }}>
        <ColorDot color="#FFFFFF" active={logoColor === 'white'} onClick={() => onLogoColorChange('white')} title="White" />
        <ColorDot color="#0D0D0D" active={logoColor === 'black'} onClick={() => onLogoColorChange('black')} title="Black" />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>Pulse icon</Typography>
        <Switch size="small" checked={iconOn} onChange={e => onIconToggle(e.target.checked)} />
      </Box>
      {iconOn && (
        <Box sx={{ display: 'flex', gap: 0.75, ml: 0.5 }}>
          {ICON_COLOR_OPTS.map(opt => (
            <ColorDot key={opt.color} color={opt.color} active={iconColor === opt.color} onClick={() => onIconColorChange(opt.color)} title={opt.title} />
          ))}
        </Box>
      )}
    </Box>
  )
}
