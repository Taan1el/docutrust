# ADR 002: Asymmetric Key Cryptography and Canonical Document Hashing

## Status
Accepted

## Context
A simple visual image stamp of a handwritten signature provides no cryptographic guarantee: it can be copy-pasted onto any document. Proving that a specific document was signed by a specific key, and that the document has not changed since, requires asymmetric public-key cryptography: a private key held only by the signer, and a public key anyone can use to check the signature.

This is a demonstration of that mechanism, not a Qualified Electronic Signature product. It does not implement identity proofing, a certificate authority, a trust service provider, or any other requirement of an electronic-signature regulation such as eIDAS, and makes no legal-validity claim.

Furthermore, minor whitespace variations (such as `\r\n` vs `\n`) between operating systems can corrupt cryptographic hashes if not canonicalized.

## Decision
1. **Asymmetric Key Standards via Native `node:crypto`**:
   - Every signature the app itself creates uses the Elliptic Curve Digital Signature Algorithm (ECDSA) with the NIST P-256 curve (`prime256v1` / secp256r1) paired with SHA-256, for compact signatures and broad support.
   - `CryptoService` also signs and verifies correctly with RSA-PSS 2048-bit keys (SHA-256, MGF1, salt length matching the digest) when a caller brings its own RSA keypair through the API's optional `privateKeyPem` field; the current UI never asks a signer to choose an algorithm or paste a key, so in practice every signature produced through the app is ECDSA. There is no certificate authority or certificate chain: a public key is trusted because it is the one stored on the signer record from the moment they signed, not because anything vouches for its owner's identity.
   - Export public keys in standard SPKI PEM format and compute a SHA-256 fingerprint of each one for display.

2. **Canonical Content Normalization**:
   - Standardize all line breaks to Unix `\n` and strip extraneous leading/trailing whitespace prior to hashing.
   - Hash the document's title together with its content (see ADR 003) so retitling a signed document is caught the same way editing the body is, and generate a 256-bit SHA-256 hex digest of the pair.

## Consequences
- **Positive**: Forging a valid signature without the private key is computationally infeasible with either supported algorithm.
- **Positive**: Cross-platform deterministic hashing prevents false positives from line-break discrepancies.
- **Trade-off**: Because there is no certificate authority, the system proves "this key signed this document," not "this named person signed this document." Binding a key to a real-world identity is outside this project's scope.
