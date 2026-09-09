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

// Add/edit dialog for one shared library background image. "New" uploads a file
// plus name/description; "Edit" only lets the name/description change — the
// image bytes themselves are immutable once uploaded (see design_studio_background_images).

import { useEffect, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogActions, OutlinedInput, Typography } from '@wso2/oxygen-ui'
import { ImageIcon } from '@wso2/oxygen-ui-icons-react'
import { validateImageFile, MAX_IMAGE_MB } from '../postBuilderCore'
import type { BackgroundImageSummary } from '../../../api/useDesignStudio'
import { fetchBackgroundThumbnail } from '../../../api/useDesignStudio'
import { useAccessToken } from '@hooks/useAccessToken'
import { FieldLabel } from './shared'

const inputSx = { fontSize: '0.82rem', bgcolor: 'background.default', '& fieldset': { borderColor: 'divider' } }

export function BackgroundImageForm({
  open, mode, initial, disabled, onClose, onSubmit,
}: {
  open: boolean
  mode: 'new' | 'edit'
  initial?: BackgroundImageSummary
  disabled?: boolean
  onClose: () => void
  onSubmit: (data: { file?: File; name: string; description: string }) => Promise<void>
}) {
  const getAccessToken = useAccessToken()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // The object URL created locally for a "New"-mode file pick, so it can be
  // revoked when superseded or on unmount. Never applies to an "Edit"-mode
  // preview — that URL is owned by useDesignStudio.ts's shared thumbnail cache
  // and other views may still be using it, so it must never be revoked here.
  const localPreviewUrlRef = useRef<string | null>(null)

  function revokeLocalPreview() {
    if (localPreviewUrlRef.current) { URL.revokeObjectURL(localPreviewUrlRef.current); localPreviewUrlRef.current = null }
  }

  useEffect(() => {
    if (!open) return
    revokeLocalPreview()
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
    setFile(null)
    setFileError(null)
    setPreview(null)
    if (mode === 'edit' && initial) {
      fetchBackgroundThumbnail(initial.id, getAccessToken).then(setPreview)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initial])

  // Revoke on unmount too — the Dialog unmounts its content on close by
  // default, so this is the backstop for "picked a file, then just closed".
  useEffect(() => revokeLocalPreview, [])

  function pickFile(f: File) {
    const err = validateImageFile(f)
    if (err) { setFileError(err); return }
    setFileError(null)
    setFile(f)
    revokeLocalPreview()
    const url = URL.createObjectURL(f)
    localPreviewUrlRef.current = url
    setPreview(url)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const canSubmit = mode === 'edit' ? name.trim().length > 0 : !!file && name.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({ file: file ?? undefined, name: name.trim(), description: description.trim() })
      onClose()
    } catch {
      // The caller (PostBuilderEditor) already surfaced the error via a toast —
      // swallow it here so the dialog just stays open with the entered data
      // (most relevant for a 409 duplicate-name error, fixable inline).
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
      <Box sx={{ p: 3 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 800, mb: 2 }}>
          {mode === 'new' ? 'Add background image' : 'Edit background image'}
        </Typography>

        {disabled && mode === 'new' ? (
          <Typography sx={{ fontSize: '0.8rem', color: 'error.main', mb: 2 }}>
            Library full — delete an image to add another.
          </Typography>
        ) : (
          <>
            {mode === 'new' && (
              <Box sx={{ mb: 1.5 }}>
                <FieldLabel>Image</FieldLabel>
                <Box
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, height: 96,
                    borderRadius: '8px', border: '1px dashed', borderColor: 'divider', bgcolor: 'background.default',
                    overflow: 'hidden', position: 'relative', cursor: 'pointer',
                  }}
                  onClick={() => fileRef.current?.click()}
                >
                  {preview ? (
                    <Box component="img" src={preview} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, color: 'text.disabled' }}>
                      <ImageIcon size={22} />
                      <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>Click to upload (max {MAX_IMAGE_MB}MB)</Typography>
                    </Box>
                  )}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
                    onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = '' }} />
                </Box>
                {fileError && <Typography sx={{ fontSize: '0.7rem', color: 'error.main', mt: 0.5 }}>{fileError}</Typography>}
              </Box>
            )}

            {mode === 'edit' && preview && (
              <Box sx={{ height: 96, borderRadius: '8px', overflow: 'hidden', mb: 1.5 }}>
                <Box component="img" src={preview} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </Box>
            )}

            <Box sx={{ mb: 1.5 }}>
              <FieldLabel>Name</FieldLabel>
              <OutlinedInput fullWidth size="small" value={name} placeholder="e.g. Event gradient"
                onChange={e => setName(e.target.value)} sx={inputSx} />
            </Box>

            <Box sx={{ mb: 0.5 }}>
              <FieldLabel>Description (optional)</FieldLabel>
              <OutlinedInput fullWidth size="small" multiline minRows={2} value={description}
                placeholder="e.g. Red and blue gradient, mostly used for event posts"
                onChange={e => setDescription(e.target.value)} sx={inputSx} />
              <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', mt: 0.5 }}>
                Helps future AI features find the right image by meaning.
              </Typography>
            </Box>
          </>
        )}
      </Box>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none', color: 'text.secondary' }}>Cancel</Button>
        {!(disabled && mode === 'new') && (
          <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || submitting}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
