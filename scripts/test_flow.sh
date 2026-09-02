#!/usr/bin/env bash
# ============================================================
#  END-TO-END TEST FLOW — Global Payment System
# ============================================================
set -e

BASE="http://localhost:3000"
ALICE_TOKEN="token-alice"
BOB_TOKEN="token-bob"
CHARLIE_TOKEN="token-charlie"

echo ""
echo "══════════════════════════════════════════════════"
echo "  GLOBAL PAYMENT SYSTEM — End-to-End Test Flow"
echo "══════════════════════════════════════════════════"
echo ""

# ── Helper ──────────────────────────────────────────────────
pretty() {
  echo "$1" | python3 -m json.tool 2>/dev/null || echo "$1"
}

sep() {
  echo ""
  echo "── $1 ──────────────────────────────────"
}

# ── 1. Health Check ─────────────────────────────────────────
sep "1. Health Check"
pretty "$(curl -s $BASE/health)"

# ── 2. API Index ─────────────────────────────────────────────
sep "2. API Index"
pretty "$(curl -s $BASE/api)"

# ── 3. Login ─────────────────────────────────────────────────
sep "3. Login (generate token for 'alice')"
pretty "$(curl -s -X POST $BASE/api/login \
  -H 'Content-Type: application/json' \
  -d '{"userId": "alice"}')"

# ── 4. KYC Verify ────────────────────────────────────────────
sep "4. KYC Verify (alice)"
pretty "$(curl -s -X POST $BASE/api/kyc/verify \
  -H "Authorization: Bearer $ALICE_TOKEN")"

# ── 5. KYC Status ────────────────────────────────────────────
sep "5. KYC Status (alice)"
pretty "$(curl -s $BASE/api/kyc/status \
  -H "Authorization: Bearer $ALICE_TOKEN")"

# ── 6. Balance Before Transfer ───────────────────────────────
sep "6. Alice Balance (before)"
pretty "$(curl -s $BASE/api/balance/alice \
  -H "Authorization: Bearer $ALICE_TOKEN")"

sep "6b. Bob Balance (before)"
pretty "$(curl -s $BASE/api/balance/bob \
  -H "Authorization: Bearer $BOB_TOKEN")"

# ── 7. Execute Transfer: alice USD → bob INR ─────────────────
sep "7. Transfer: alice sends 500 USD → bob (INR)"
pretty "$(curl -s -X POST $BASE/api/transfer \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Idempotency-Key: test-flow-transfer-1" \
  -H 'Content-Type: application/json' \
  -d '{
    "senderId": "alice",
    "receiverId": "bob",
    "amount": 500,
    "sourceCurrency": "USD",
    "destCurrency": "INR"
  }')"

# ── 8. Second Transfer ───────────────────────────────────────
sep "8. Transfer: charlie sends 200 EUR → diana (AED)"
pretty "$(curl -s -X POST $BASE/api/transfer \
  -H "Authorization: Bearer $CHARLIE_TOKEN" \
  -H "Idempotency-Key: test-flow-transfer-2" \
  -H 'Content-Type: application/json' \
  -d '{
    "senderId": "charlie",
    "receiverId": "diana",
    "amount": 200,
    "sourceCurrency": "EUR",
    "destCurrency": "AED"
  }')"

# ── 9. Third Transfer ────────────────────────────────────────
sep "9. Transfer: alice sends 1000 USD → charlie (USD)"
pretty "$(curl -s -X POST $BASE/api/transfer \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Idempotency-Key: test-flow-transfer-3" \
  -H 'Content-Type: application/json' \
  -d '{
    "senderId": "alice",
    "receiverId": "charlie",
    "amount": 1000,
    "sourceCurrency": "USD",
    "destCurrency": "USD"
  }')"

# ── 9b. Failure Path: Insufficient Funds ─────────────────────
sep "9b. Failure Path: Alice tries to send 50000 USD (Insufficient Funds)"
pretty "$(curl -s -X POST $BASE/api/transfer \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Idempotency-Key: test-flow-transfer-fail-1" \
  -H 'Content-Type: application/json' \
  -d '{
    "senderId": "alice",
    "receiverId": "bob",
    "amount": 50000,
    "sourceCurrency": "USD",
    "destCurrency": "INR"
  }')"

# ── 10. Balance After Transfers ──────────────────────────────
sep "10. Alice Balance (after)"
pretty "$(curl -s $BASE/api/balance/alice \
  -H "Authorization: Bearer $ALICE_TOKEN")"

sep "10b. Bob Balance (after)"
pretty "$(curl -s $BASE/api/balance/bob \
  -H "Authorization: Bearer $BOB_TOKEN")"

# ── 11. Settlement Queue Status ──────────────────────────────
sep "11. Settlement Queue Status"
pretty "$(curl -s $BASE/api/settlement/status \
  -H "Authorization: Bearer $ALICE_TOKEN")"

# ── 12. Run Settlement ───────────────────────────────────────
sep "12. Run Settlement (batch + blockchain anchor)"
pretty "$(curl -s -X POST $BASE/api/settlement/run \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -H "Idempotency-Key: test-flow-settlement-1")"

# ── 13. Settlement History ───────────────────────────────────
sep "13. Blockchain Settlement History"
pretty "$(curl -s $BASE/api/settlement/history \
  -H "Authorization: Bearer $ALICE_TOKEN")"

# ── 14. Transaction History ──────────────────────────────────
sep "14. Alice Transaction History"
pretty "$(curl -s $BASE/api/transactions/alice \
  -H "Authorization: Bearer $ALICE_TOKEN")"

# ── 15. All Balances ─────────────────────────────────────────
sep "15. All User Balances (ledger snapshot)"
pretty "$(curl -s $BASE/api/balance \
  -H "Authorization: Bearer $ALICE_TOKEN")"

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✓ Test Flow Complete"
echo "══════════════════════════════════════════════════"
echo ""
