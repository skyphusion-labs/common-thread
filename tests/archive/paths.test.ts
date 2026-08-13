import { describe, expect, it } from 'vitest';
import {
  assertSafeInvestigationId,
  isValidInvestigationId,
  packetPdfFilename,
  safeFilenameToken,
} from '../../implementation/archive/paths';

describe('investigation id allowlist (#282)', () => {
  it('accepts slug-like ids', () => {
    expect(isValidInvestigationId('my-investigation-1')).toBe(true);
    expect(isValidInvestigationId('inv_2026.08.13')).toBe(true);
    expect(isValidInvestigationId('A')).toBe(true);
    expect(isValidInvestigationId('a'.repeat(64))).toBe(true);
  });

  it('rejects quote, slash, CR/LF, and overlong ids', () => {
    expect(isValidInvestigationId('bad/id')).toBe(false);
    expect(isValidInvestigationId('x".pdf')).toBe(false);
    expect(isValidInvestigationId('id\r\nEvil')).toBe(false);
    expect(isValidInvestigationId('-leading-hyphen')).toBe(false);
    expect(isValidInvestigationId('a'.repeat(65))).toBe(false);
    expect(isValidInvestigationId('')).toBe(false);
    expect(() => assertSafeInvestigationId('bad/id')).toThrow(/Invalid investigationId/);
  });

  it('strips Content-Disposition breakers from PDF filenames', () => {
    expect(safeFilenameToken('ok-id')).toBe('ok-id');
    expect(safeFilenameToken('x".pdf\r\n')).toBe('x_.pdf__');
    expect(packetPdfFilename('ok-id', 'run-1')).toBe('common-thread-ok-id-run-run-1.pdf');
    expect(packetPdfFilename('a"b', 'c\nd')).not.toMatch(/["\r\n]/);
  });
});
