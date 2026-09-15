# ADR 003: Mathematical Signature Verification and Tamper Detection

## Status
Accepted

## Context
If a document's terms (such as payment amounts, interest rates, or liability clauses) are altered after signing, the system should detect the change and stop presenting the existing signatures as valid for the new text. The verification step has to decide this from the database contents alone, since nothing stops a row from being edited directly.

## Decision
1. **Re-Hashing Verification**:
   - The verification engine independently re-hashes the current title and content read from the database using the same canonical process used at signing time:
     $$H_{\text{current}} = \text{SHA256}(\text{canonical}(\text{title}, \text{content}))$$
   - It compares $H_{\text{current}}$ with the sealed $H_{\text{expected}}$ recorded at creation time. If $H_{\text{current}} \neq H_{\text{expected}}$, the document is flagged as tampered (`isTampered = true`), and every signature is reported invalid regardless of whether that particular signer's own clause changed.

2. **Public-Key Verification**:
   - For each signer, their signature is verified against $H_{\text{current}}$ using their stored public key:
     $$\text{Verify}(H_{\text{current}}, \text{Signature}, \text{PublicKey}) \stackrel{?}{=} \text{true}$$
   - Because every signature was produced over the hash at signing time, a mismatched current hash makes verification fail for all of them at once.

3. **Tamper Simulator**:
   - An interactive page lets anyone running the app overwrite a signed document's title and/or content while intentionally leaving the old sealed hash in place, then re-verify to see the seal break. This is the only code path that writes content without recomputing its hash; it exists to demonstrate the check, not to model a real attack technique.

## Consequences
- **Positive**: Any change to the sealed title or content is detected on the next verification, because the recomputed hash can only match if both are byte-for-byte what was signed.
- **Positive**: Clear visual feedback in the UI showing which signers are valid and flagging tamper violations in crimson.
- **Trade-off**: This detects tampering; it does not prevent it. Anyone with direct access to the database can still edit a row, and the audit log is a plain append-only table, not a cryptographic hash chain (see ADR 001), so a direct edit to old rows would not itself be detected. What the design guarantees is that a tampered document can never verify as unchanged.
