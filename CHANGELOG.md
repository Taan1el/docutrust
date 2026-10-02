# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- New visual identity built around paper and ink: a parchment desk, the open agreement shown as a white sheet in a serif face, and a margin column on the right holding signature blocks and the verification result. Agreements now sit in a slim list on the left, the tamper tester and audit trail sit under the sheet, and hashes and signatures are set in a typewriter face. The overview strip and table are gone; a one-line tally replaces them. Behavior and features are unchanged.

## [1.0.0] - 2026-10-02

### Added
- Express API for multi-party document signing: create an agreement, sign it per signer, verify every signature, and simulate tampering, backed by Node's native SQLite (`node:sqlite`, WAL mode).
- Canonical SHA-256 hashing of a document's title and content together (`shared/canonical.ts`), so retitling a signed document is caught the same way an edit to the body is.
- ECDSA P-256/SHA-256 signatures generated with `node:crypto` for every signature the UI produces; the crypto service also signs and verifies RSA-PSS 2048-bit keys supplied through the API, though the current UI never asks a signer to bring one.
- Verification re-hashes the current title and content and checks each signer's signature against that hash, so a tampered document reports every signature as broken, not just the one over the changed clause.
- React 19 dashboard: an agreements table, a document detail view with a dense signer list and audit trail, a sign flow, a create-agreement flow, and an inline tamper tester.
- In-browser demo mode for GitHub Pages: the same canonicalization, validation and hashing code from `shared/` runs against Web Crypto (ECDSA P-256/SHA-256) and a localStorage-backed store instead of the Express API, with deterministic sample agreements and a "Reset sample data" control.
- Docker image (multi-stage build, runs as a non-root user, serves the built client) and a Compose file for local use.
- CI workflow (lint, test, build, build:pages, Docker build) and a GitHub Pages deployment workflow, gated on the repository being public.

### Fixed
- The production build's entry point, database path resolution, and static client serving did not match what `npm start` and the Docker image actually produced, so a built image could not serve requests or persist data correctly.
- The README claimed eIDAS-style legal validity and a "Qualified Electronic Signature" style guarantee that the code does not implement; the docs and UI now describe only what the cryptography actually does (a key signed this hash, not a verified real-world identity).
- The dashboard's document list used non-interactive elements for selectable rows and had no accessible names for several controls; agreements are now real buttons in a table with correct ARIA roles, and every interactive element has a visible label.
- The tamper simulator lived behind a modal dialog even though its whole purpose is to be compared against the verification result next to it; it is now an always-visible form beside that result.
