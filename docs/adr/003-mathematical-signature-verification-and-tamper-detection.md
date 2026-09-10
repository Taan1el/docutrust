# ADR 003: Mathematical Signature Verification and Tamper Detection

## Status
Accepted

## Context
A critical requirement in legaltech and digital contract enforcement is tamper evidence. If a document's terms (such as payment amounts, interest rates, or liability clauses) are altered by even a single character after signing, the system must immediately and unequivocally flag the modification, break the cryptographic seal, and declare all associated signatures invalid.

## Decision
1. **Dynamic Re-Hashing Verification Protocol**:
   - The verification engine independently re-hashes the current document content from the database using the canonical SHA-256 algorithm:
     $$H_{\text{current}} = \text{SHA256}(\text{canonical}(\text{content}))$$
   - It compares $H_{\text{current}}$ with the sealed $H_{\text{expected}}$ recorded at creation time. If $H_{\text{current}} \neq H_{\text{expected}}$, the document is immediately flagged as tampered (`isTampered = true`).

2. **Public-Key Cryptographic Verification**:
   - For each signer, their signature is verified against $H_{\text{current}}$ using their stored public key:
     $$\text{Verify}(H_{\text{current}}, \text{Signature}, \text{PublicKey}) \stackrel{?}{=} \text{true}$$
   - If the document was modified, the mathematical verification fails with an explicit error detailing the seal breach.

3. **Tamper Simulator for Auditing**:
   - Provide an interactive tester allowing security evaluators to inject modified contract clauses and observe instant cryptographic rejection.

## Consequences
- **Positive**: 100% mathematical guarantee against unauthorized document alteration or database injection attacks.
- **Positive**: Clear visual feedback in the UI showing which signers are valid and flagging tamper violations in crimson.
