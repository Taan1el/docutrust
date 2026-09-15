// Request payload validation shared by the Express API (server/src/routes)
// and the in-browser demo (client/src/services/demoApi.ts), so a malformed
// request is rejected the same way and with the same message on both.
import { badRequest } from './errors.js';
import type { CreateDocumentPayload } from './types.js';

export const MAX_TITLE_LENGTH = 300;
export const MAX_CONTENT_LENGTH = 200_000;
export const MAX_SIGNERS = 20;
export const MAX_NAME_LENGTH = 200;
export const MAX_EMAIL_LENGTH = 320;
export const MAX_ROLE_LENGTH = 200;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('Request body must be a JSON object');
  }
  return payload as Record<string, unknown>;
}

export function parseCreateDocumentPayload(payload: unknown): CreateDocumentPayload {
  const body = asObject(payload);

  const title = asString(body.title)?.trim();
  if (!title) throw badRequest('title is required and must be a non-empty string');
  if (title.length > MAX_TITLE_LENGTH) {
    throw badRequest(`title must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }

  const content = asString(body.content)?.trim();
  if (!content) throw badRequest('content is required and must be a non-empty string');
  if (content.length > MAX_CONTENT_LENGTH) {
    throw badRequest(`content must be ${MAX_CONTENT_LENGTH} characters or fewer`);
  }

  const signers = body.signers;
  if (!Array.isArray(signers) || signers.length === 0) {
    throw badRequest('At least one signer is required');
  }
  if (signers.length > MAX_SIGNERS) {
    throw badRequest(`No more than ${MAX_SIGNERS} signers are supported`);
  }

  const parsedSigners = signers.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw badRequest(`Signer ${idx + 1} must be an object with name, email and role`);
    }
    const { name, email, role } = raw as Record<string, unknown>;

    const trimmedName = asString(name)?.trim();
    if (!trimmedName) throw badRequest(`Signer ${idx + 1} is missing a name`);
    if (trimmedName.length > MAX_NAME_LENGTH) {
      throw badRequest(`Signer ${idx + 1}'s name must be ${MAX_NAME_LENGTH} characters or fewer`);
    }

    const trimmedEmail = asString(email)?.trim();
    if (!trimmedEmail || trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(trimmedEmail)) {
      throw badRequest(`Signer ${idx + 1} needs a valid email address`);
    }

    const trimmedRole = asString(role)?.trim();
    if (!trimmedRole) throw badRequest(`Signer ${idx + 1} is missing a role`);
    if (trimmedRole.length > MAX_ROLE_LENGTH) {
      throw badRequest(`Signer ${idx + 1}'s role must be ${MAX_ROLE_LENGTH} characters or fewer`);
    }

    return { name: trimmedName, email: trimmedEmail, role: trimmedRole };
  });

  return { title, content, signers: parsedSigners };
}

export interface SignPayload {
  signerId: string;
  privateKeyPem?: string;
}

export function parseSignPayload(payload: unknown): SignPayload {
  const body = asObject(payload);

  const signerId = asString(body.signerId)?.trim();
  if (!signerId) throw badRequest('signerId is required in request body');

  const privateKeyPem = asString(body.privateKeyPem)?.trim();
  return privateKeyPem ? { signerId, privateKeyPem } : { signerId };
}

export interface TamperPayload {
  tamperedTitle?: string;
  tamperedContent?: string;
}

export function parseTamperPayload(payload: unknown): TamperPayload {
  const body = asObject(payload);

  const rawTitle = asString(body.tamperedTitle);
  const rawContent = asString(body.tamperedContent);
  const tamperedTitle = rawTitle !== undefined ? rawTitle.trim() : undefined;
  const tamperedContent = rawContent !== undefined ? rawContent.trim() : undefined;

  if (!tamperedTitle && !tamperedContent) {
    throw badRequest('Provide tamperedTitle and/or tamperedContent to simulate tampering');
  }
  if (tamperedTitle && tamperedTitle.length > MAX_TITLE_LENGTH) {
    throw badRequest(`tamperedTitle must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }
  if (tamperedContent && tamperedContent.length > MAX_CONTENT_LENGTH) {
    throw badRequest(`tamperedContent must be ${MAX_CONTENT_LENGTH} characters or fewer`);
  }

  return {
    ...(tamperedTitle ? { tamperedTitle } : {}),
    ...(tamperedContent ? { tamperedContent } : {}),
  };
}
