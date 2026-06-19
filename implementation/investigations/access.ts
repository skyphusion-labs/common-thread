/**
 * Capability-based access for investigations.
 *
 * Each investigation receives an unguessable bearer token at creation. The
 * server stores only a SHA-256 hash; the plaintext token is returned once.
 * Holders of the token can read (and write while status is active).
 * Sealed investigations are read-only.
 */

import { queryOne } from '../db';
import type { InvestigationRow } from '../schema/db-types';

const TOKEN_PREFIX = 'ct_';

export type InvestigationStatus = InvestigationRow['status'];

export interface PublicInvestigation {
  id: string;
  name: string;
  description: string | null;
  status: InvestigationStatus;
  created_at: string;
  updated_at: string;
}

export function publicInvestigationView(row: InvestigationRow): PublicInvestigation {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Generate a URL-safe capability token (43 chars of entropy after prefix). */
export function generateAccessToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${TOKEN_PREFIX}${encoded}`;
}

export async function hashAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Extract bearer token from Authorization, X-Investigation-Token, or ?access_token= */
export function extractAccessToken(request: Request, url: URL): string | null {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const headerToken = request.headers.get('X-Investigation-Token')?.trim();
  if (headerToken) return headerToken;

  const queryToken = url.searchParams.get('access_token')?.trim();
  if (queryToken) return queryToken;

  return null;
}

export function isInvestigationWritable(status: InvestigationStatus): boolean {
  return status === 'active';
}

export type AccessErrorCode =
  | 'missing_token'
  | 'invalid_token'
  | 'not_found'
  | 'read_only';

export class InvestigationAccessError extends Error {
  constructor(
    readonly code: AccessErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'InvestigationAccessError';
  }
}

export interface AuthorizeOptions {
  /** Reject sealed/archived investigations for mutating routes. */
  requireWrite?: boolean;
}

/**
 * Verify the request carries the investigation capability token.
 * Returns the investigation row on success.
 */
export async function authorizeInvestigation(
  db: Hyperdrive,
  request: Request,
  url: URL,
  investigationId: string,
  options: AuthorizeOptions = {}
): Promise<InvestigationRow> {
  const row = await queryOne<InvestigationRow>(
    db,
    'SELECT * FROM investigations WHERE id = ?',
    [investigationId]
  );

  if (!row) {
    throw new InvestigationAccessError('not_found', `Investigation not found: ${investigationId}`);
  }

  const token = extractAccessToken(request, url);
  if (!token) {
    throw new InvestigationAccessError(
      'missing_token',
      'Investigation access token required. Pass Authorization: Bearer <token>, X-Investigation-Token, or ?access_token=.'
    );
  }

  const presentedHash = await hashAccessToken(token);
  if (!row.access_token_hash || !timingSafeEqual(presentedHash, row.access_token_hash)) {
    throw new InvestigationAccessError('invalid_token', 'Invalid investigation access token.');
  }

  if (options.requireWrite && !isInvestigationWritable(row.status)) {
    throw new InvestigationAccessError(
      'read_only',
      `Investigation is ${row.status} and cannot be modified. Unseal is not supported; create a new investigation to continue work.`
    );
  }

  return row;
}

export function accessErrorStatus(code: AccessErrorCode): number {
  switch (code) {
    case 'missing_token':
    case 'invalid_token':
      return 401;
    case 'not_found':
      return 404;
    case 'read_only':
      return 403;
  }
}
