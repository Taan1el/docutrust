// Typed errors carrying an HTTP status, thrown by the signing service and the
// in-browser demo adapter alike so both surfaces report the same status code
// and message for the same problem. Anything else that gets thrown (a native
// SQLite error, a crypto library failure) is treated as unexpected and never
// shown to the client verbatim; see server/src/app.ts and services/index.ts.
export class DocuTrustError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DocuTrustError';
    this.status = status;
  }
}

export function isDocuTrustError(err: unknown): err is DocuTrustError {
  return err instanceof DocuTrustError;
}

export function badRequest(message: string): DocuTrustError {
  return new DocuTrustError(400, message);
}

export function notFound(message: string): DocuTrustError {
  return new DocuTrustError(404, message);
}

export function conflict(message: string): DocuTrustError {
  return new DocuTrustError(409, message);
}
