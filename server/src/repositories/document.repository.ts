import { DatabaseSync } from 'node:sqlite';
import type {
  DocumentRecord,
  DocumentSigner,
  AuditEvent,
  DocumentStatus,
} from '../../../shared/types.js';

export class DocumentRepository {
  constructor(private db: DatabaseSync) {}

  createDocument(
    doc: {
      id: string;
      title: string;
      content: string;
      contentHash: string;
      status: DocumentStatus;
      createdAt: string;
      updatedAt: string;
    },
    signers: DocumentSigner[],
    initialAudit: AuditEvent
  ): void {
    const insertDoc = this.db.prepare(`
      INSERT INTO documents (id, title, content, content_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSigner = this.db.prepare(`
      INSERT INTO signers (id, document_id, name, email, role, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertAudit = this.db.prepare(`
      INSERT INTO audit_events (id, document_id, action, actor_name, actor_email, details_json, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec('BEGIN TRANSACTION;');
    try {
      insertDoc.run(
        doc.id,
        doc.title,
        doc.content,
        doc.contentHash,
        doc.status,
        doc.createdAt,
        doc.updatedAt
      );

      for (const s of signers) {
        insertSigner.run(s.id, s.documentId, s.name, s.email, s.role, s.status);
      }

      insertAudit.run(
        initialAudit.id,
        initialAudit.documentId,
        initialAudit.action,
        initialAudit.actorName,
        initialAudit.actorEmail ?? null,
        JSON.stringify(initialAudit.details),
        initialAudit.timestamp
      );

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  getDocumentById(id: string): DocumentRecord | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
    if (!row) return null;

    const signersRows = this.db
      .prepare('SELECT * FROM signers WHERE document_id = ? ORDER BY id ASC')
      .all(id) as any[];

    const auditRows = this.db
      .prepare('SELECT * FROM audit_events WHERE document_id = ? ORDER BY timestamp ASC')
      .all(id) as any[];

    const signers: DocumentSigner[] = signersRows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      name: r.name,
      email: r.email,
      role: r.role,
      status: r.status,
      publicKeyPem: r.public_key_pem || undefined,
      signatureHex: r.signature_hex || undefined,
      signedAt: r.signed_at || undefined,
      ipAddress: r.ip_address || undefined,
      userAgent: r.user_agent || undefined,
    }));

    const auditTrail: AuditEvent[] = auditRows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      action: r.action,
      actorName: r.actor_name,
      actorEmail: r.actor_email || undefined,
      details: JSON.parse(r.details_json || '{}'),
      timestamp: r.timestamp,
    }));

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      contentHash: row.content_hash,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || undefined,
      signers,
      auditTrail,
    };
  }

  getAllDocuments(): DocumentRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM documents ORDER BY created_at DESC')
      .all() as any[];

    return rows.map((row) => {
      const signersRows = this.db
        .prepare('SELECT * FROM signers WHERE document_id = ? ORDER BY id ASC')
        .all(row.id) as any[];

      const signers: DocumentSigner[] = signersRows.map((r) => ({
        id: r.id,
        documentId: r.document_id,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
        publicKeyPem: r.public_key_pem || undefined,
        signatureHex: r.signature_hex || undefined,
        signedAt: r.signed_at || undefined,
      }));

      return {
        id: row.id,
        title: row.title,
        content: row.content,
        contentHash: row.content_hash,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at || undefined,
        signers,
      };
    });
  }

  updateSignerSignature(
    signerId: string,
    signatureHex: string,
    publicKeyPem: string,
    signedAt: string,
    ipAddress?: string,
    userAgent?: string
  ): void {
    this.db
      .prepare(`
        UPDATE signers
        SET status = 'SIGNED', signature_hex = ?, public_key_pem = ?, signed_at = ?, ip_address = ?, user_agent = ?
        WHERE id = ?
      `)
      .run(signatureHex, publicKeyPem, signedAt, ipAddress ?? null, userAgent ?? null, signerId);
  }

  updateDocumentStatus(documentId: string, status: DocumentStatus, completedAt?: string): void {
    this.db
      .prepare(`
        UPDATE documents
        SET status = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(status, completedAt ?? null, new Date().toISOString(), documentId);
  }

  updateDocumentContent(documentId: string, newContent: string, newHash: string): void {
    this.db
      .prepare(`
        UPDATE documents
        SET content = ?, content_hash = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(newContent, newHash, new Date().toISOString(), documentId);
  }

  addAuditEvent(event: AuditEvent): void {
    this.db
      .prepare(`
        INSERT INTO audit_events (id, document_id, action, actor_name, actor_email, details_json, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.id,
        event.documentId,
        event.action,
        event.actorName,
        event.actorEmail ?? null,
        JSON.stringify(event.details),
        event.timestamp
      );
  }
}
