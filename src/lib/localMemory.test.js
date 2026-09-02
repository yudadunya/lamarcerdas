import { describe, expect, it } from 'vitest'
import { normalizeBackup, validateBackup } from './localMemory'

describe('localMemory backup validation', () => {
  it('accepts a minimal backup and fills every known store', () => {
    const backup = { version: 2, data: { settings: [{ id: 'main' }] } }

    expect(validateBackup(backup)).toBe(true)
    expect(normalizeBackup(backup)).toMatchObject({
      version: 2,
      data: {
        settings: [{ id: 'main' }],
        genome: [],
        chatMessages: [],
        journalEntries: [],
      },
    })
  })

  it('rejects malformed store values and unsupported versions', () => {
    expect(validateBackup({ data: { settings: {} } })).toBe(false)
    expect(validateBackup({ version: 999, data: {} })).toBe(false)
    expect(() => normalizeBackup({ data: { settings: {} } })).toThrow(/tidak valid/i)
  })

  it('rejects oversized backup payloads before IndexedDB writes', () => {
    const oversized = { data: { journalEntries: [{ id: '1', text: 'x'.repeat(5 * 1024 * 1024) }] } }
    expect(validateBackup(oversized)).toBe(false)
  })
})
