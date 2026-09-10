import { DatabaseSync } from 'node:sqlite';
import { DocumentRepository } from '../repositories/document.repository.js';
import { CryptoService } from '../services/crypto.service.js';
import { SigningService } from '../services/signing.service.js';

export function seedDatabase(db: DatabaseSync): void {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
  if (countRow && countRow.count > 0) return;

  console.log('[DocuTrust Seed] Seeding sample cryptographic agreements...');
  const repo = new DocumentRepository(db);
  const crypto = new CryptoService();
  const service = new SigningService(repo, crypto);

  // 1. Fully completed GDPR Agreement
  const gdprDoc = service.createDocument(
    {
      title: 'FinTech Cloud Data Processing Agreement (DPA & DORA Compliant)',
      content: `FINTECH CLOUD DATA PROCESSING ADDENDUM\n\n1. SCOPE AND PURPOSE\nThis Data Processing Agreement ("DPA") governs the processing of personal and financial telemetry in accordance with Regulation (EU) 2016/679 (GDPR) and the Digital Operational Resilience Act (DORA).\n\n2. TECHNICAL AND ORGANIZATIONAL MEASURES\nThe Processor shall maintain end-to-end asymmetric encryption (ECDSA P-256 and AES-GCM-256) for all data at rest and in transit across EU data centers.\n\n3. AUDIT RIGHTS\nThe Controller retains immutable verification rights through cryptographic audit ledgers.\n\nExecuted under Estonian and EU digital signature standards.`,
      signers: [
        {
          name: 'Elena Rostova',
          email: 'elena.rostova@balticpay.io',
          role: 'Chief Information Security Officer',
        },
        {
          name: 'Markus Berg',
          email: 'markus.berg@dpo-advisors.eu',
          role: 'External Data Protection Officer',
        },
      ],
    },
    'Legal & Compliance Portal'
  );

  // Sign both signers
  service.signDocument(gdprDoc.id, gdprDoc.signers[0].id, undefined, '195.250.186.12', 'Smart-ID App v3.4');
  service.signDocument(gdprDoc.id, gdprDoc.signers[1].id, undefined, '80.235.48.91', 'e-Residency DigiDoc4 v5.2');

  // 2. Partially signed SaaS MSA
  const msaDoc = service.createDocument(
    {
      title: 'Nordic Enterprise Master Services Agreement (MSA)',
      content: `MASTER SERVICES AGREEMENT\n\nBETWEEN: TallinnTech OÜ ("Provider")\nAND: Nordic Enterprise AB ("Customer")\n\n1. SERVICES\nProvider grants Customer a non-exclusive subscription to the Enterprise Cloud Gateway with guaranteed 99.95% monthly uptime.\n\n2. FEES AND PAYMENT\nInvoiced monthly in EUR, payable within 30 calendar days via SEPA transfer.\n\n3. GOVERNING LAW\nThis Agreement is governed by the laws of the Republic of Estonia.`,
      signers: [
        {
          name: 'Kasper Tamm',
          email: 'kasper.tamm@tallinntech.ee',
          role: 'Founder & CEO',
        },
        {
          name: 'Sofia Lindström',
          email: 'sofia.l@nordicenterprise.se',
          role: 'VP Procurement & Sourcing',
        },
      ],
    },
    'Sales Operations'
  );

  // Sign first signer
  service.signDocument(msaDoc.id, msaDoc.signers[0].id, undefined, '194.126.115.4', 'Estonian ID-Card Client 24.6');

  // 3. Pending SAFE Equity Instrument
  service.createDocument(
    {
      title: 'Simple Agreement for Future Equity (SAFE - €1,500,000 Cap)',
      content: `SIMPLE AGREEMENT FOR FUTURE EQUITY\n\nVALUATION CAP: EUR 1,500,000\nDISCOUNT RATE: 20%\n\nIn exchange for the payment of the Purchase Amount by the Investor, the Company issues to the Investor the right to certain shares of Company capital stock upon the closing of an Equity Financing round.`,
      signers: [
        {
          name: 'Rasmus Kallas',
          email: 'rasmus@cloudorbit.ee',
          role: 'Managing Director / Founder',
        },
        {
          name: 'Helena Vainio',
          email: 'helena@nordicvc.fi',
          role: 'General Partner, Nordic Ventures',
        },
      ],
    },
    'Cap Table Administrator'
  );

  console.log('[DocuTrust Seed] Successfully seeded 3 enterprise cryptographic agreements.');
}
