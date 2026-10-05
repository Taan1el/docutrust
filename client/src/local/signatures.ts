import { p256Sign, p256Verify, webCrypto as subtle } from './p256.js';

export const SIGNATURE_ALGORITHM = 'ECDSA-P256-SHA256' as const;
export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

export interface SigningIdentity {
  name: string;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  createdAt: string;
}

export interface SignatureRecord {
  signer: string;
  signedAt: string;
  publicKeyJwk: JsonWebKey;
  signature: string;
}

export interface SignatureBundle {
  version: 1;
  algorithm: typeof SIGNATURE_ALGORITHM;
  file: { name: string; size: number; sha256: string };
  signatures: SignatureRecord[];
}

export interface VerificationResult {
  matchesFile: boolean;
  signatures: { signer: string; signedAt: string; valid: boolean; error?: string }[];
}

function fail(source: string, field: string, message: string): never {
  throw new Error(`${source}: ${field} ${message}`);
}

function object(value: unknown, source: string, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(source, field, 'must be an object.');
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: string[], source: string, field: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(source, `${field}.${key}`, 'is not supported.');
  }
}

function label(value: unknown, source: string, field: string, limit: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(source, field, `must be a non-empty string of at most ${limit} characters without control characters.`);
  }
}

function timestamp(value: unknown, source: string, field: string): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    fail(source, field, 'must be a UTC timestamp in YYYY-MM-DDTHH:mm:ss.sssZ format.');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1970 || date.toISOString() !== value) {
    fail(source, field, 'must be a valid UTC timestamp from 1970 onward.');
  }
}

function base64Bytes(value: unknown, source: string, field: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail(source, field, 'must be canonical base64.');
  }
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    fail(source, field, 'must be canonical base64.');
  }
  if (btoa(decoded) !== value) fail(source, field, 'must be canonical base64.');
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function coordinate(value: unknown, source: string, field: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    fail(source, field, 'must be a 32-byte base64url coordinate.');
  }
  const bytes = base64Bytes(value.replace(/-/g, '+').replace(/_/g, '/') + '=', source, field);
  if (bytes.byteLength !== 32) fail(source, field, 'must be a 32-byte base64url coordinate.');
}

/** Validates a public P-256 JWK without accepting private key material. */
export function validatePublicKeyJwk(value: unknown, source = 'Public key', field = 'publicKeyJwk'): JsonWebKey {
  const key = object(value, source, field);
  if ('d' in key) fail(source, `${field}.d`, 'must not contain private key material.');
  fields(key, ['kty', 'crv', 'x', 'y', 'ext', 'key_ops', 'alg', 'use', 'kid'], source, field);
  if (key.kty !== 'EC') fail(source, `${field}.kty`, 'must be EC.');
  if (key.crv !== 'P-256') fail(source, `${field}.crv`, 'must be P-256.');
  coordinate(key.x, source, `${field}.x`);
  coordinate(key.y, source, `${field}.y`);
  if ('ext' in key && typeof key.ext !== 'boolean') fail(source, `${field}.ext`, 'must be a boolean.');
  if ('key_ops' in key && (!Array.isArray(key.key_ops) || key.key_ops.length !== 1 || key.key_ops[0] !== 'verify')) {
    fail(source, `${field}.key_ops`, 'must contain only verify.');
  }
  if ('alg' in key && key.alg !== 'ES256') fail(source, `${field}.alg`, 'must be ES256.');
  if ('use' in key && key.use !== 'sig') fail(source, `${field}.use`, 'must be sig.');
  if ('kid' in key) label(key.kid, source, `${field}.kid`, 200);
  return structuredClone(key) as JsonWebKey;
}

function validateHeader(value: unknown, source: string): Omit<SignatureBundle, 'signatures'> & { signatures: unknown[] } {
  const bundle = object(value, source, 'bundle');
  fields(bundle, ['version', 'algorithm', 'file', 'signatures'], source, 'bundle');
  if (bundle.version !== 1) fail(source, 'version', 'must be 1.');
  if (bundle.algorithm !== SIGNATURE_ALGORITHM) fail(source, 'algorithm', `must be ${SIGNATURE_ALGORITHM}.`);
  const file = object(bundle.file, source, 'file');
  fields(file, ['name', 'size', 'sha256'], source, 'file');
  label(file.name, source, 'file.name', 1024);
  if (typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0) {
    fail(source, 'file.size', 'must be a non-negative safe integer.');
  }
  if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
    fail(source, 'file.sha256', 'must be a lowercase 64-character SHA-256 hex digest.');
  }
  if (!Array.isArray(bundle.signatures) || bundle.signatures.length === 0 || bundle.signatures.length > 1000) {
    fail(source, 'signatures', 'must be an array containing 1 to 1000 signatures.');
  }
  return {
    version: 1,
    algorithm: SIGNATURE_ALGORITHM,
    file: { name: file.name, size: file.size, sha256: file.sha256 },
    signatures: bundle.signatures,
  };
}

function validateRecord(value: unknown, source: string, field: string): SignatureRecord {
  const record = object(value, source, field);
  fields(record, ['signer', 'signedAt', 'publicKeyJwk', 'signature'], source, field);
  label(record.signer, source, `${field}.signer`, 200);
  timestamp(record.signedAt, source, `${field}.signedAt`);
  const publicKeyJwk = validatePublicKeyJwk(record.publicKeyJwk, source, `${field}.publicKeyJwk`);
  const signature = base64Bytes(record.signature, source, `${field}.signature`);
  if (signature.byteLength !== 64) fail(source, `${field}.signature`, 'must decode to a 64-byte ECDSA signature.');
  return { signer: record.signer, signedAt: record.signedAt, publicKeyJwk, signature: record.signature as string };
}

/** Strict parsing reports the source filename and the invalid field. */
export function parseBundle(text: string, filename = 'signature-bundle.json'): SignatureBundle {
  if (text.length > MAX_BUNDLE_BYTES || new TextEncoder().encode(text).byteLength > MAX_BUNDLE_BYTES) {
    fail(filename, 'JSON', 'must be no larger than 2 MiB.');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(filename, 'JSON', 'is invalid.');
  }
  const bundle = validateHeader(value, filename);
  return { ...bundle, signatures: bundle.signatures.map((record, index) => validateRecord(record, filename, `signatures[${index}]`)) };
}

export function serializeBundle(bundle: SignatureBundle): string {
  return JSON.stringify(parseBundle(JSON.stringify(bundle)), null, 2) + '\n';
}

async function fileBytes(file: File | Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('The selected file could not be read.'));
    };
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.onabort = () => reject(new Error('Reading the selected file was cancelled.'));
    reader.readAsArrayBuffer(file);
  });
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashFile(file: File | Blob): Promise<string> {
  return hex(await subtle().digest('SHA-256', await fileBytes(file)));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return '{' + Object.keys(objectValue).sort().map((key) => JSON.stringify(key) + ':' + canonical(objectValue[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * Version 1 signs the SHA-256 digest bytes of a UTF-8 canonical JSON object.
 * Object keys sort lexicographically; arrays keep their order. The object is
 * { version, algorithm, file, signer, signedAt, publicKeyJwk }. ECDSA itself
 * uses SHA-256. This binds the filename, size, file hash and signer metadata.
 */
async function signingDigest(bundle: Pick<SignatureBundle, 'version' | 'algorithm' | 'file'>, record: Omit<SignatureRecord, 'signature'>): Promise<ArrayBuffer> {
  return subtle().digest('SHA-256', new TextEncoder().encode(canonical({
    version: bundle.version,
    algorithm: bundle.algorithm,
    file: bundle.file,
    signer: record.signer,
    signedAt: record.signedAt,
    publicKeyJwk: record.publicKeyJwk,
  })));
}

function base64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function verifyRecord(bundle: Pick<SignatureBundle, 'version' | 'algorithm' | 'file'>, record: SignatureRecord): Promise<{ valid: boolean; error?: string }> {
  let publicKey: CryptoKey;
  try {
    publicKey = await subtle().importKey('jwk', record.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch {
    return { valid: false, error: 'The public key is not a valid P-256 point.' };
  }
  try {
    const valid = await p256Verify(
      publicKey,
      base64Bytes(record.signature, 'Signature bundle', 'signature'), await signingDigest(bundle, record),
    );
    return valid ? { valid: true } : { valid: false, error: 'The signature does not authenticate this file metadata and signer record.' };
  } catch {
    return { valid: false, error: 'The signature could not be verified.' };
  }
}

export async function createIdentity(name: string): Promise<SigningIdentity> {
  const trimmedName = name.trim();
  label(trimmedName, 'Signing identity', 'name', 200);
  const keys = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKeyJwk = validatePublicKeyJwk(await subtle().exportKey('jwk', keys.publicKey));
  return { name: trimmedName, privateKey: keys.privateKey, publicKeyJwk, createdAt: new Date().toISOString() };
}

/** Valid signatures authenticate the bundle. matchesFile separately authenticates the selected bytes and filename. */
export async function verifyFile(file: File | Blob, value: SignatureBundle): Promise<VerificationResult> {
  const bundle = validateHeader(value, 'Signature bundle');
  const matchesFile = file.size === bundle.file.size && await hashFile(file) === bundle.file.sha256 &&
    (!('name' in file) || file.name === bundle.file.name);
  const signatures = await Promise.all(bundle.signatures.map(async (value, index) => {
    const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const signer = typeof raw.signer === 'string' ? raw.signer : 'Unknown signer';
    const signedAt = typeof raw.signedAt === 'string' ? raw.signedAt : '';
    try {
      const record = validateRecord(value, 'Signature bundle', `signatures[${index}]`);
      return { signer, signedAt, ...await verifyRecord(bundle, record) };
    } catch (error) {
      return { signer, signedAt, valid: false, error: error instanceof Error ? error.message : 'The signature record is invalid.' };
    }
  }));
  return { matchesFile, signatures };
}

export async function signFile(file: File, identity: SigningIdentity, existing?: SignatureBundle): Promise<SignatureBundle> {
  label(identity.name, 'Signing identity', 'name', 200);
  timestamp(identity.createdAt, 'Signing identity', 'createdAt');
  const privateKey = identity.privateKey;
  if (!privateKey || privateKey.type !== 'private' || privateKey.extractable || privateKey.algorithm.name !== 'ECDSA' ||
      (privateKey.algorithm as EcKeyAlgorithm).namedCurve !== 'P-256' || !privateKey.usages.includes('sign')) {
    throw new Error('Signing identity: privateKey must be a non-extractable ECDSA P-256 signing key.');
  }
  const publicKeyJwk = validatePublicKeyJwk(identity.publicKeyJwk, 'Signing identity');
  label(file.name, 'Selected file', 'name', 1024);
  let bundle: SignatureBundle;
  if (existing) {
    bundle = parseBundle(JSON.stringify(existing), 'Existing signature bundle');
    const result = await verifyFile(file, bundle);
    if (!result.matchesFile) throw new Error('The selected file does not match the existing bundle filename, size and SHA-256 hash.');
    if (result.signatures.some((record) => !record.valid)) throw new Error('The existing bundle contains an invalid signature. It cannot be signed again.');
    if (bundle.signatures.length >= 1000) throw new Error('The signature bundle already contains the maximum of 1000 signatures.');
  } else {
    bundle = { version: 1, algorithm: SIGNATURE_ALGORITHM, file: { name: file.name, size: file.size, sha256: await hashFile(file) }, signatures: [] };
  }
  const metadata = { signer: identity.name, signedAt: new Date().toISOString(), publicKeyJwk };
  const signature = base64(await p256Sign(privateKey, await signingDigest(bundle, metadata)));
  const record = { ...metadata, signature };
  if (!(await verifyRecord(bundle, record)).valid) throw new Error('Signing identity: the private key does not match the public key.');
  return parseBundle(JSON.stringify({ ...bundle, signatures: [...bundle.signatures, record] }), 'Signed signature bundle');
}
