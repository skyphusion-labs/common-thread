/**
 * Packet-level detached signing helpers (methodology paper 8.1.3).
 *
 * Thin reporting-layer wrappers over the Ed25519 primitives in
 * archive/signing.ts: compute the SHA-256 of the canonical packet Markdown and
 * sign / verify a detached signature over it. Kept out of the pure meta module
 * because they use Web Crypto; still dependency-light (no DB/R2).
 */
import { sha256 } from '../archive/hash';
import {
  signPacket,
  verifyPacketSignature,
  type PacketSignature,
  type PacketVerificationResult,
} from '../archive/signing';

/** SHA-256 (lowercase hex) of the canonical packet Markdown. */
export async function packetMarkdownSha256(markdown: string): Promise<string> {
  return sha256(new TextEncoder().encode(markdown));
}

/** Sign a packet canonical Markdown, returning a detached signature record. */
export async function signPacketMarkdown(
  privateKeyB64: string,
  markdown: string,
  options: { signerId?: string; note?: string } = {}
): Promise<PacketSignature> {
  return signPacket(privateKeyB64, await packetMarkdownSha256(markdown), options);
}

/** Verify a detached packet signature against the given canonical Markdown. */
export async function verifyPacketMarkdown(
  markdown: string,
  signature: PacketSignature
): Promise<PacketVerificationResult> {
  return verifyPacketSignature(signature, await packetMarkdownSha256(markdown));
}
