// Canonicalization shared by the server (node:crypto) and the in-browser
// demo (Web Crypto). Hashing only works as a tamper check if both sides
// normalize the text the same way before hashing it, so this lives here
// instead of being duplicated in server/src/services/crypto.service.ts and
// client/src/services/demoCrypto.ts.

/** Normalizes line endings to `\n` and trims surrounding whitespace. */
export function canonicalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * Builds the exact string that gets hashed to seal a document. Title and
 * content are hashed together so that changing either one after signing
 * breaks the seal, not just edits to the body text. JSON-encoding the pair
 * (rather than concatenating them) avoids ambiguity between, for example,
 * {title: "AB", content: "C"} and {title: "A", content: "BC"}.
 */
export function buildDocumentDigestInput(title: string, content: string): string {
  return JSON.stringify({
    title: canonicalizeText(title),
    content: canonicalizeText(content),
  });
}
