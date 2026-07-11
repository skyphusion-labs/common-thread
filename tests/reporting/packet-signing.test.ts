/**
 * Detached Ed25519 evidence-packet signing (issue #71, paper §8.1.3).
 *
 * Pure crypto (Web Crypto Ed25519), no DB/R2, so it runs in the workers pool.
 */
import { describe, expect, it } from "vitest";
import { generateKeyPair, signPacket } from "../../implementation/archive/signing";
import {
  packetMarkdownSha256,
  signPacketMarkdown,
  verifyPacketMarkdown,
} from "../../implementation/reporting/packet-signing";

const MARKDOWN = "# Evidence packet\n\nInvestigation inv_1, run 7.\n";

describe("packet signing (§8.1.3)", () => {
  it("signs the canonical Markdown and verifies it back", async () => {
    const { privateKey } = await generateKeyPair();
    const sig = await signPacketMarkdown(privateKey, MARKDOWN, { signerId: "practitioner-a" });

    expect(sig.algorithm).toBe("ed25519");
    expect(sig.signerId).toBe("practitioner-a");
    expect(sig.packetSha256).toBe(await packetMarkdownSha256(MARKDOWN));
    expect(sig.signature.length).toBeGreaterThan(0);

    const result = await verifyPacketMarkdown(MARKDOWN, sig);
    expect(result.valid).toBe(true);
  });

  it("rejects a tampered packet (hash mismatch)", async () => {
    const { privateKey } = await generateKeyPair();
    const sig = await signPacketMarkdown(privateKey, MARKDOWN);

    const result = await verifyPacketMarkdown(MARKDOWN + "tampered", sig);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/hash mismatch/i);
  });

  it("rejects a tampered signature payload", async () => {
    const { privateKey } = await generateKeyPair();
    const sig = await signPacketMarkdown(privateKey, MARKDOWN);

    // Swap signedAt without re-signing: the signature no longer covers the payload.
    const forged = { ...sig, signedAt: "1999-01-01T00:00:00.000Z" };
    const result = await verifyPacketMarkdown(MARKDOWN, forged);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not verify/i);
  });

  it("rejects a signature made by a different key", async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const sig = await signPacketMarkdown(a.privateKey, MARKDOWN);

    // Present the signature as if it were bs public key.
    const forged = { ...sig, publicKey: b.publicKey };
    const result = await verifyPacketMarkdown(MARKDOWN, forged);
    expect(result.valid).toBe(false);
  });

  it("rejects a non-hex packet digest at signing time", async () => {
    const { privateKey } = await generateKeyPair();
    await expect(signPacket(privateKey, "not-a-hash")).rejects.toThrow(/lowercase SHA-256 hex/);
  });
});
