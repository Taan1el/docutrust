# ADR 002: Asymmetric Key Cryptography and Canonical Document Hashing

## Status
Accepted

## Context
High-assurance electronic signatures (such as Qualified Electronic Signatures under EU Regulation 910/2014 eIDAS and Estonian digital identity standards) require asymmetric public-key cryptography. A simple visual image stamp of a handwritten signature provides zero legal or cryptographic guarantee. The platform must prove signatory intent using private keys held exclusively by the signer and verify authenticity via public keys.

Furthermore, minor whitespace variations (such as `\r\n` vs `\n`) between operating systems can corrupt cryptographic hashes if not canonicalized.

## Decision
1. **Asymmetric Key Standards via Native `node:crypto`**:
   - Utilize Elliptic Curve Digital Signature Algorithm (ECDSA) with the NIST P-256 curve (`prime256v1` / secp256r1) paired with SHA-256 for optimal security, compact signature sizes, and compliance with modern PKI standards.
   - Also support RSA-PSS 2048-bit keypairs for legacy enterprise interoperability.
   - Export public keys in standard SPKI PEM format and compute SHA-256 key fingerprints for easy audit verification.

2. **Canonical Content Normalization**:
   - Standardize all line breaks to Unix `\n` and strip extraneous leading/trailing whitespace prior to hashing.
   - Generate a canonical 256-bit SHA-256 hex digest representing the immutable content of the agreement.

## Consequences
- **Positive**: Strict mathematical proof of signatory identity; impossible for attackers to forge without the private key.
- **Positive**: Cross-platform deterministic hashing prevents false positives from line-break discrepancies.
