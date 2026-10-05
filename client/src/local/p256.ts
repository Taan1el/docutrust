export function webCrypto(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('Web Crypto is unavailable. Open this page over HTTPS or on localhost.');
  return api;
}

/** Shared ECDSA primitive; callers choose and authenticate their payload format. */
export function p256Sign(privateKey: CryptoKey, data: BufferSource): Promise<ArrayBuffer> {
  return webCrypto().sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data);
}

export function p256Verify(publicKey: CryptoKey, signature: BufferSource, data: BufferSource): Promise<boolean> {
  return webCrypto().verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, data);
}
