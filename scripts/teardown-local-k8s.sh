#!/usr/bin/env bash
# Teardown local Kubernetes cluster.
# Usage: ./scripts/teardown-local-k8s.sh [--full]

set -euo pipefail

echo "=== Récif Local K8s Teardown ==="

if ! colima status &>/dev/null; then
    echo "Colima is not running. Nothing to teardown."
    exit 0
fi

echo "Removing Istio..."
istioctl uninstall --purge -y 2>/dev/null || echo "  Istio not found or already removed"
kubectl delete namespace istio-system --ignore-not-found 2>/dev/null

echo "Removing platform namespaces..."
kubectl delete namespace recif-system --ignore-not-found 2>/dev/null
kubectl delete namespace team-default --ignore-not-found 2>/dev/null

echo "Stopping Colima..."
colima stop

if [ "${1:-}" = "--full" ]; then
    echo "Deleting Colima VM (--full mode)..."
    colima delete -f
    echo "VM deleted."
fi

echo "=== Teardown Complete ==="
