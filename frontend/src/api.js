// ============================================================
//  API CLIENT — All backend calls
// ============================================================

const BASE = '/api';

/**
 * Generate a random idempotency key (UUID v4 equivalent).
 * Used for all write (POST) requests to protect against duplicate submissions.
 */
function generateIdempotencyKey() {
  // crypto.randomUUID() is available in all modern browsers
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Attach idempotency key to all write requests
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    headers['Idempotency-Key'] = generateIdempotencyKey();
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data.data;
}

export const api = {
  login: (userId) =>
    request('POST', '/login', { userId }),

  // ── KYC —————————————————————————————————————————————————
  /** Step 1: Submit government ID */
  kycSubmitId: (token, idType, idNumber) =>
    request('POST', '/kyc/submit', { idType, idNumber }, token),

  /** Step 2: Submit address proof */
  kycSubmitAddress: (token, addressProof) =>
    request('POST', '/kyc/address', { addressProof }, token),

  /** Step 3: Submit selfie / face verification */
  kycSubmitFace: (token, selfie) =>
    request('POST', '/kyc/face', { selfie }, token),

  /** Get full KYC status object */
  kycStatus: (token) =>
    request('GET', '/kyc/status', null, token),

  // ── Transfers ────────────────────────────────────────────
  transfer: (token, body) =>
    request('POST', '/transfer', body, token),

  // ── Balance ──────────────────────────────────────────────
  balance: (token, userId) =>
    request('GET', `/balance/${userId}`, null, token),

  // ── Transactions ─────────────────────────────────────────
  transactions: (token, userId) =>
    request('GET', `/transactions/${userId}`, null, token),

  // ── Settlement ───────────────────────────────────────────
  settlementRun: (token) =>
    request('POST', '/settlement/run', null, token),

  settlementStatus: (token) =>
    request('GET', '/settlement/status', null, token),

  settlementHistory: (token) =>
    request('GET', '/settlement/history', null, token),
};
