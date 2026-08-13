import { describe, expect, it } from 'vitest';
import {
  GENERIC_JOB_ERROR,
  MAX_JOB_ERROR_LEN,
  publicJobErrorMessage,
  sanitizeJobErrorMessage,
} from '../../implementation/workers/job-error';

describe('sanitizeJobErrorMessage (#282)', () => {
  it('keeps product-facing messages', () => {
    expect(sanitizeJobErrorMessage('empty manifest: collect artifacts first')).toContain(
      'empty manifest'
    );
  });

  it('genericizes SQL / driver strings', () => {
    expect(
      sanitizeJobErrorMessage('driver failure: host=192.0.2.9 user=root password=hunter2')
    ).toBe(GENERIC_JOB_ERROR);
    expect(sanitizeJobErrorMessage('ER_ACCESS_DENIED_ERROR: Access denied for user')).toBe(
      GENERIC_JOB_ERROR
    );
    expect(sanitizeJobErrorMessage(new Error('mysql2 ECONNREFUSED'))).toBe(GENERIC_JOB_ERROR);
  });

  it('truncates long safe messages', () => {
    expect(sanitizeJobErrorMessage('x'.repeat(9000)).length).toBe(MAX_JOB_ERROR_LEN);
  });

  it('publicJobErrorMessage keeps null for completed jobs', () => {
    expect(publicJobErrorMessage(null)).toBeNull();
    expect(publicJobErrorMessage('')).toBeNull();
    expect(publicJobErrorMessage('host=evil')).toBe(GENERIC_JOB_ERROR);
  });
});
