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

import { useRef } from 'react'
import { Box, Button } from '@wso2/oxygen-ui'
import { SaveIcon, FileUpIcon } from '@wso2/oxygen-ui-icons-react'

export function ProjectActions({ onSave, onLoadFile }: { onSave: () => void; onLoadFile: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button size="small" variant="outlined" startIcon={<SaveIcon size={16} />}
        onClick={onSave} sx={{ textTransform: 'none', flex: 1 }}>
        Save project
      </Button>
      <input ref={fileRef} type="file" accept="application/json" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) onLoadFile(f); e.target.value = '' }} />
      <Button size="small" variant="outlined" startIcon={<FileUpIcon size={16} />}
        onClick={() => fileRef.current?.click()} sx={{ textTransform: 'none', flex: 1 }}>
        Load project
      </Button>
    </Box>
  )
}
