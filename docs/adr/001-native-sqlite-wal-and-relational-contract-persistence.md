# ADR 001: Native SQLite WAL and Relational Contract Persistence

## Status
Accepted

## Context
Digital contract and legal agreement platforms demand atomic transactions, relational schema integrity across signers and audit logs, and low-latency document hydration. Standard approaches frequently introduce external database containers (PostgreSQL / MySQL) that complicate local setup or resort to unstructured document stores that lack strict foreign key constraints.

For DocuTrust, we required:
1. Zero-dependency local developer execution (`npm run dev` running instantly without external database daemons).
2. Strict relational integrity connecting documents, designated signers, and immutable audit events with foreign key cascading.
3. Sub-millisecond snapshot queries during signature verification and signing workflows.

## Decision
1. **Node.js 24 Native `node:sqlite` in WAL Mode**:
   - Utilize Node.js's built-in `DatabaseSync` engine running in Write-Ahead Logging mode (`PRAGMA journal_mode = WAL;`).
   - Enforce relational constraints via `PRAGMA foreign_keys = ON;`.
   - Separate data into `documents` (content, canonical hash, status), `signers` (identity, public key PEM, signature hex, timestamp, IP), and `audit_events` (immutable chronological event trail).

2. **Atomic Multi-Entity Transactions**:
   - Creating an agreement commits the document, signers, and initial creation audit event inside an isolated SQLite transaction (`BEGIN TRANSACTION ... COMMIT;`).

## Consequences
- **Positive**: Sub-millisecond read/write latency with zero external database dependencies.
- **Positive**: Unit and integration test suites instantiate ephemeral `:memory:` SQLite instances with instant teardown and 100% test isolation.
- **Trade-off**: For horizontal multi-node scaling, replication can be managed via Litestream or SQLite replaced with a managed PostgreSQL instance.
