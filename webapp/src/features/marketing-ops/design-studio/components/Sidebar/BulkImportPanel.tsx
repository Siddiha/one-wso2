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

// Bulk CSV/XLSX import: upload a spreadsheet, click a row to populate the
// form. exceljs is used only here (not in postBuilderCore, which stays
// library-free) — the row → field mapping logic itself lives in
// postBuilderCore.importRowToPatch so it's unit-testable without a real file.
//
// exceljs, not xlsx (see events/rules/workbook.ts for the app's established
// exceljs reading pattern) — loaded on demand, same rationale: it's large and
// only an upload/template-download needs it.

import { useState } from 'react'
import { Box, Button, Typography } from '@wso2/oxygen-ui'
import { FileDownIcon, FolderArchiveIcon } from '@wso2/oxygen-ui-icons-react'
import {
  BULK_IMPORT_TEMPLATE_HEADERS, BULK_IMPORT_TEMPLATE_ROWS,
  csvRowTitle, filterMeaningfulRows, importRowToPatch, parseCsvRows, type ImportedRowPatch,
} from '../postBuilderCore'
import { FieldLabel } from './shared'

async function downloadTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Posts')
  ws.addRow([...BULK_IMPORT_TEMPLATE_HEADERS])
  BULK_IMPORT_TEMPLATE_ROWS.forEach(row => {
    ws.addRow(BULK_IMPORT_TEMPLATE_HEADERS.map(h => row[h] ?? ''))
  })
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'wso2-post-builder-bulk-import-template.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// Reads an uploaded .xlsx into the same lowercase-header Record<string, string>[]
// shape parseCsvRows produces — the first non-empty row is the header row, every
// row after it becomes one record keyed by that row's (lowercased, trimmed)
// headings. Doesn't need workbook.ts's full member-status/column-definition
// machinery — a bulk-import row is free-form (any of the columns
// importRowToPatch understands), not gated by an admin-defined contract.
async function readXlsxRows(file: File): Promise<Record<string, string>[]> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []

  let headers: string[] = []
  let headerSeen = false
  const rows: Record<string, string>[] = []
  // { includeEmpty: false } skips blank rows but keeps each callback's
  // `rowNumber` as the row's real position in the sheet — so a blank first
  // row means the first callback fires with rowNumber 2, not 1. The header
  // row is whichever row is visited FIRST, not whichever is numbered 1.
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[] | undefined
    const cells = (values ?? []).slice(1).map(v => cellToString(v))
    if (!headerSeen) {
      headerSeen = true
      headers = cells.map(c => c.toLowerCase())
      return
    }
    const record: Record<string, string> = {}
    headers.forEach((h, i) => { if (h) record[h] = cells[i] ?? '' })
    rows.push(record)
  })
  return filterMeaningfulRows(rows)
}

// exceljs hands back rich objects for formulas/hyperlinks/rich text and Date
// instances for date cells — flatten every shape to a trimmed string.
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const v = value as {
      result?: unknown; richText?: { text: string }[]; text?: string; error?: string
      formula?: string; sharedFormula?: string
    }
    if (v.error) return '' // #N/A and friends are not data
    if (v.result !== undefined) return cellToString(v.result)
    if (v.richText) return v.richText.map(r => r.text).join('').trim()
    if (v.text !== undefined) return String(v.text).trim()
    if (v.formula !== undefined || v.sharedFormula !== undefined) return ''
    return ''
  }
  return String(value).trim()
}

export function BulkImportPanel({ onApplyRow, onExportAll, onError }: {
  onApplyRow: (patch: ImportedRowPatch) => void
  onExportAll: (rows: Record<string, string>[]) => Promise<void>
  onError: (message: string) => void
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  async function handleExportAll() {
    if (!rows.length || exporting) return
    setExporting(true)
    try {
      await onExportAll(rows)
    } catch {
      onError("Couldn't export all rows. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  function handleFile(file: File) {
    if (file.name.toLowerCase().endsWith('.csv')) {
      const reader = new FileReader()
      reader.onerror = () => onError("Couldn't read that file. Please try again.")
      reader.onload = ev => {
        try {
          setRows(parseCsvRows(String(ev.target?.result ?? '')))
          setActiveIdx(null)
        } catch (err) {
          console.error(err)
          onError("Couldn't read that file — check it's a valid CSV or Excel file.")
        }
      }
      reader.readAsText(file)
    } else {
      readXlsxRows(file)
        .then(mapped => { setRows(mapped); setActiveIdx(null) })
        .catch(err => {
          console.error(err)
          onError("Couldn't read that file — check it's a valid CSV or Excel file.")
        })
    }
  }

  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <FieldLabel>Bulk import (CSV / Excel)</FieldLabel>
        <Button
          size="small" onClick={() => { downloadTemplate().catch(() => onError("Couldn't generate the template file.")) }} startIcon={<FileDownIcon size={14} />}
          sx={{ textTransform: 'none', fontSize: '0.68rem', color: 'primary.main', minWidth: 0, py: 0, px: 0, mr: 0.5, mb: 0.25, '&:hover': { bgcolor: 'action.hover' } }}
        >
          Download template
        </Button>
      </Box>
      <Box component="label" sx={{
        display: 'block', textAlign: 'center', py: 1.2, mb: 1, borderRadius: '8px', border: '1px dashed',
        borderColor: 'divider', fontSize: '0.72rem', color: 'text.secondary', cursor: 'pointer',
      }}>
        Click to upload a .csv or .xlsx file
        <input type="file" accept=".csv,.xlsx" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      </Box>
      {rows.length > 0 && (
        <>
          <Button
            fullWidth size="small" variant="outlined" onClick={handleExportAll} disabled={exporting}
            startIcon={<FolderArchiveIcon size={16} />}
            sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, mb: 1 }}
          >
            {exporting ? 'Exporting…' : `Export all (${rows.length})`}
          </Button>
          <Box sx={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {rows.map((row, i) => (
              <Box
                key={i} onClick={() => { setActiveIdx(i); onApplyRow(importRowToPatch(row)) }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderRadius: '6px', cursor: 'pointer',
                  border: '1px solid', borderColor: activeIdx === i ? 'primary.main' : 'divider',
                  bgcolor: activeIdx === i ? 'action.selected' : 'background.default',
                }}
              >
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {csvRowTitle(row)}
                </Typography>
                <Typography sx={{ fontSize: '0.64rem', color: 'text.disabled', flexShrink: 0 }}>{row.type || '—'}</Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}
