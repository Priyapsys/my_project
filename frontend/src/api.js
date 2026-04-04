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

  kycVerify: (token) =>
    request('POST', '/kyc/verify', null, token),

  kycStatus: (token) =>
    request('GET', '/kyc/status', null, token),

  transfer: (token, body) =>
    request('POST', '/transfer', body, token),

  balance: (token, userId) =>
    request('GET', `/balance/${userId}`, null, token),

  transactions: (token, userId) =>
    request('GET', `/transactions/${userId}`, null, token),

  settlementRun: (token) =>
    request('POST', '/settlement/run', null, token),

  settlementStatus: (token) =>
    request('GET', '/settlement/status', null, token),

  settlementHistory: (token) =>
    request('GET', '/settlement/history', null, token),
};
