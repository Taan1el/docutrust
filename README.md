# DocuTrust 🔏📜
> **Cryptographic Document Signing, PKI Digital Signatures & Tamper Verification Engine**  
> *Engineered for High-Assurance e-ID Workflows, Asymmetric Key Cryptography (ECDSA/RSA) & Immutable Audit Trails*

[![CI Pipeline](https://img.shields.io/badge/CI-Passing-10b981.svg?style=flat-square)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg?style=flat-square)](#)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933.svg?style=flat-square)](#)
[![Database](https://img.shields.io/badge/Database-SQLite%20WAL%20(Native)-003B57.svg?style=flat-square)](#)
[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square)](#)
[![Cryptography](https://img.shields.io/badge/Cryptography-ECDSA%20P--256%20%2F%20SHA--256-10b981.svg?style=flat-square)](#)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ed.svg?style=flat-square)](#)

---

## ⚡ 2-Minute Overview
**DocuTrust** is an enterprise-grade digital signature and legal contract sealing platform modeled after the European and Estonian digital identity ecosystem (Smart-ID, e-Residency, DigiDoc, and EU Regulation 910/2014 eIDAS). Built with native asymmetric cryptography, it enables multi-party digital signing ceremonies, canonical SHA-256 document hashing, mathematical public key verification (`crypto.verify`), and real-time cryptographic tamper detection.

### Core Capabilities
1. **Asymmetric Public-Key Cryptography (PKI)**: Utilizes native `node:crypto` Elliptic Curve Digital Signatures (ECDSA P-256 / secp256r1) and RSA-PSS 2048-bit keypairs. Public keys are fingerprint-indexed and signatures are verified mathematically without third-party SaaS reliance.
2. **Canonical SHA-256 Document Hashing**: Content is standardized across line endings (`\r\n` vs `\n`) and hashed into an immutable 256-bit digest prior to signing, preventing platform-specific hashing discrepancies.
3. **Multi-Party Signing Finite State Machine**: Manages contract lifecycle transitions (`DRAFT` &rarr; `PENDING_SIGNATURES` &rarr; `PARTIALLY_SIGNED` &rarr; `COMPLETED` / `SEALED`) with designated signer roles and verification certificates.
4. **Instant Tamper Detection & Seal Breach**: The verification engine re-hashes the agreement content dynamically. If a single character is altered after signing, the cryptographic seal breaks instantly, alerting users with a glowing red tamper banner.
5. **Interactive Tamper Testing Sandbox**: Built-in evaluation tool allowing engineers to inject modified contract terms and witness instant mathematical signature invalidation.
6. **Immutable Cryptographic Audit Trail**: Chronologically records all actions (`DOCUMENT_CREATED`, `DOCUMENT_SIGNED`, `DOCUMENT_SEALED`, `VERIFICATION_PERFORMED`, `TAMPER_DETECTED`) with timestamps, IP addresses, and user-agent metadata.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Client ["Frontend (React 19 + TypeScript + Vite)"]
        UI[DocuTrust Operations Console]
        DocList[Agreement Explorer]
        Viewer[Document Parchment Viewer]
        Stamps[Digital Signature Stamp Cards]
        SignMod[Signing Ceremony Modal]
        TamperMod[Tamper Detection Sandbox]
        CreateMod[New Agreement Modal]

        UI --> DocList
        UI --> Viewer
        Viewer --> Stamps
        UI --> SignMod
        UI --> TamperMod
        UI --> CreateMod
    end

    subgraph Server ["Backend (Node.js 24 + Express + Native SQLite WAL)"]
        API[Express REST Gateway /api]
        SigningSvc[Signing & Lifecycle Service]
        CryptoSvc[Native Crypto & PKI Engine]
        DocRepo[Document & Signer Repository]

        API --> SigningSvc
        SigningSvc --> CryptoSvc
        SigningSvc --> DocRepo
    end

    subgraph Storage ["Relational Storage"]
        DB[(SQLite WAL Database)]
        D[documents]
        S[signers (Public Keys & Signatures)]
        A[audit_events (Immutable Trail)]

        DocRepo --> D
        DocRepo --> S
        DocRepo --> A
    end

    UI <-->|REST API /api/documents| API
```

---

## 🚀 Quick Start (Zero-Config)

### Prerequisites
- Node.js 24+ (uses native `node:sqlite` and `node:crypto`)
- npm 10+

### Local Development
```bash
# 1. Clone repository
git clone https://github.com/Taan1el/docutrust.git
cd docutrust

# 2. Install workspace dependencies
npm install

# 3. Start backend API and frontend Vite dev server concurrently
npm run dev

# Backend runs at:  http://localhost:4000
# Frontend runs at: http://localhost:5173
```

### Running Automated Tests
```bash
# Run all unit and integration tests (15 passing across server and client)
npm test

# Run TypeScript type-checks and linting across workspaces
npm run lint

# Build production bundles
npm run build
```

### Docker Deployment
```bash
# Spin up production container with persistent SQLite volume
docker compose up --build
# Open http://localhost:4000 in your browser
```

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Healthcheck and cryptographic engine status |
| `GET` | `/api/documents` | List all agreements with signer status summaries |
| `POST` | `/api/documents` | Create and hash a new multi-party agreement |
| `GET` | `/api/documents/:id` | Retrieve agreement details, signers, and audit trail |
| `POST` | `/api/documents/:id/sign` | Execute digital signature for a designated signer |
| `GET` | `/api/documents/:id/verify` | Re-hash and mathematically verify all signatures |
| `POST` | `/api/documents/:id/tamper` | Simulate unauthorized content modification |
| `GET` | `/api/crypto/keypair` | Generate on-demand ECDSA / RSA asymmetric keypair bundle |

---

## 📐 Architecture Decision Records (ADRs)

Detailed architectural rationale:
- [ADR 001: Native SQLite WAL and Relational Contract Persistence](docs/adr/001-native-sqlite-wal-and-relational-contract-persistence.md)
- [ADR 002: Asymmetric Key Cryptography and Canonical Document Hashing](docs/adr/002-asymmetric-key-cryptography-and-canonical-document-hashing.md)
- [ADR 003: Mathematical Signature Verification and Tamper Detection](docs/adr/003-mathematical-signature-verification-and-tamper-detection.md)

---

## 🧪 Verification & Quality Checklist

- [x] **15 Automated Tests Passing** (10 backend cryptographic integration + 5 frontend component tests).
- [x] **Zero External Cryptographic Dependencies**: Powered entirely by Node.js native `node:crypto` (ECDSA P-256 & SHA-256).
- [x] **Relational Schema Integrity**: Native SQLite with WAL mode, foreign keys, and indexes.
- [x] **Full TypeScript Strict Compliance**: End-to-end type safety sharing `shared/types.ts` between client and server.
- [x] **Multi-Stage Docker & Compose**: Production container with health check and persistent data volume.
