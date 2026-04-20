// ============================================================
//  API CLIENT — All backend calls
// ============================================================

const BASE = '/api';

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

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
