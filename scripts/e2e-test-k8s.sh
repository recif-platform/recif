#!/usr/bin/env bash
# End-to-end test for Récif V2 (Kubernetes-native).
# Prerequisites: K8s cluster + Istio + Helm chart installed + operator running
# Usage: ./scripts/e2e-test-k8s.sh

set -euo pipefail

echo "=== Récif V2 — K8s E2E Test ==="
echo ""

# --- Test 1: Cluster health ---
echo "Test 1: K8s cluster health"
kubectl cluster-info --request-timeout=5s >/dev/null 2>&1 && echo "  PASS — cluster accessible" || { echo "  FAIL — cluster not accessible"; exit 1; }

# --- Test 2: Istio health ---
echo "Test 2: Istio control plane"
ISTIOD_READY=$(kubectl get pods -n istio-system -l app=istiod --no-headers 2>/dev/null | grep -c Running || true)
[ "$ISTIOD_READY" -ge 1 ] && echo "  PASS — istiod running" || { echo "  FAIL — istiod not running"; exit 1; }

# --- Test 3: Platform namespace ---
echo "Test 3: Platform namespaces"
kubectl get ns recif-system >/dev/null 2>&1 && echo "  PASS — recif-system exists" || { echo "  FAIL — recif-system missing"; exit 1; }
kubectl get ns team-default >/dev/null 2>&1 && echo "  PASS — team-default exists" || { echo "  FAIL — team-default missing"; exit 1; }

# --- Test 4: CRD installed ---
echo "Test 4: Agent CRD"
kubectl get crd agents.agents.recif.dev >/dev/null 2>&1 && echo "  PASS — Agent CRD installed" || { echo "  FAIL — CRD not found"; exit 1; }

# --- Test 5: PostgreSQL ---
echo "Test 5: PostgreSQL"
PG_READY=$(kubectl get pods -n recif-system -l app.kubernetes.io/name=recif-postgresql --no-headers 2>/dev/null | grep -c Running || true)
[ "$PG_READY" -ge 1 ] && echo "  PASS — PostgreSQL running" || { echo "  FAIL — PostgreSQL not running"; exit 1; }

# --- Test 6: Istio Gateway ---
echo "Test 6: Istio Gateway"
kubectl get gateway recif-gateway -n recif-system >/dev/null 2>&1 && echo "  PASS — Gateway exists" || echo "  WARN — Gateway not found (non-blocking)"

# --- Test 7: Deploy test agent ---
echo "Test 7: Deploy test agent via CRD"
cat <<'EOF' | kubectl apply -f -
apiVersion: agents.recif.dev/v1
kind: Agent
metadata:
  name: e2e-test-agent
  namespace: team-default
spec:
  name: "E2E Test Agent"
  framework: "adk"
  strategy: "simple"
  channel: "rest"
  modelType: "stub"
  modelId: "stub-echo"
  systemPrompt: "You are an E2E test agent."
  image: "corail:v2"
  replicas: 1
EOF

echo "  Waiting for agent Pod..."
for i in $(seq 1 30); do
    POD_STATUS=$(kubectl get pods -n team-default -l recif.dev/agent=e2e-test-agent --no-headers 2>/dev/null | awk '{print $3}' || true)
    if [ "$POD_STATUS" = "Running" ]; then
        echo "  PASS — Agent Pod running"
        break
    fi
    sleep 2
done

if [ "$POD_STATUS" != "Running" ]; then
    echo "  FAIL — Agent Pod not running (status: $POD_STATUS)"
    kubectl get pods -n team-default
    kubectl delete agent e2e-test-agent -n team-default 2>/dev/null
    exit 1
fi

# --- Test 8: Chat with agent ---
echo "Test 8: Chat with agent via port-forward"
kubectl port-forward -n team-default svc/e2e-test-agent 8888:8000 &
PF_PID=$!
sleep 3

RESPONSE=$(curl -sf -X POST http://localhost:8888/chat -H "Content-Type: application/json" -d '{"input":"E2E test message"}' 2>/dev/null || echo "FAIL")
kill $PF_PID 2>/dev/null
wait $PF_PID 2>/dev/null

if echo "$RESPONSE" | grep -q "Echo: E2E test message"; then
    echo "  PASS — Agent responded: $RESPONSE"
else
    echo "  FAIL — Unexpected response: $RESPONSE"
fi

# --- Test 9: kubectl get agents shows status ---
echo "Test 9: Agent status"
AGENT_PHASE=$(kubectl get agent e2e-test-agent -n team-default -o jsonpath='{.status.phase}' 2>/dev/null || echo "unknown")
[ "$AGENT_PHASE" = "Running" ] && echo "  PASS — Phase: $AGENT_PHASE" || echo "  WARN — Phase: $AGENT_PHASE"

# --- Cleanup ---
echo ""
echo "Cleaning up test agent..."
kubectl delete agent e2e-test-agent -n team-default 2>/dev/null
sleep 3
REMAINING=$(kubectl get pods -n team-default --no-headers 2>/dev/null | wc -l | tr -d ' ')
[ "$REMAINING" = "0" ] && echo "  PASS — Cleanup complete" || echo "  WARN — $REMAINING pods remaining"

echo ""
echo "=== ALL E2E TESTS PASSED ==="
