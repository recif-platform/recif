#!/usr/bin/env bash
# End-to-end test for the Récif + Corail platform.
# Run after deploying the platform (Kind + Helm or port-forwards active)
# Usage: ./scripts/e2e-test.sh

set -euo pipefail

BASE_RECIF="http://localhost:8080"
BASE_CORAIL="http://localhost:8000"
MAX_WAIT=120
INTERVAL=5

echo "=== Récif + Corail E2E Test ==="

# Wait for services
echo "Waiting for services to be healthy..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
    recif_ok=$(curl -sf "$BASE_RECIF/healthz" 2>/dev/null || true)
    corail_ok=$(curl -sf "$BASE_CORAIL/healthz" 2>/dev/null || true)

    if echo "$recif_ok" | grep -q '"ok"' && echo "$corail_ok" | grep -q '"ok"'; then
        echo "All services healthy after ${elapsed}s"
        break
    fi

    echo "  Waiting... (${elapsed}s / ${MAX_WAIT}s)"
    sleep $INTERVAL
    elapsed=$((elapsed + INTERVAL))
done

if [ $elapsed -ge $MAX_WAIT ]; then
    echo "FAIL: Services did not become healthy within ${MAX_WAIT}s"
    exit 1
fi

# Test 1: Récif health
echo ""
echo "Test 1: Récif /api/v1/health"
response=$(curl -sf "$BASE_RECIF/api/v1/health")
echo "  Response: $response"
echo "$response" | grep -q '"healthy"' && echo "  PASS" || { echo "  FAIL"; exit 1; }

# Test 2: Corail health
echo ""
echo "Test 2: Corail /healthz"
response=$(curl -sf "$BASE_CORAIL/healthz")
echo "  Response: $response"
echo "$response" | grep -q '"ok"' && echo "  PASS" || { echo "  FAIL"; exit 1; }

# Test 3: Chat with seed agent
echo ""
echo "Test 3: Chat with seed agent (SSE)"
response=$(curl -sf -X POST "$BASE_CORAIL/api/v1/agents/ag_TESTAGENTSTUB00000000000/chat" \
    -H "Content-Type: application/json" \
    -d '{"input": "Hello from E2E test!"}')
echo "  Response: $response"
echo "$response" | grep -q "Echo: Hello from E2E test!" && echo "  PASS" || { echo "  FAIL"; exit 1; }

echo ""
echo "=== ALL E2E TESTS PASSED ==="
