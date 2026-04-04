#!/usr/bin/env bash
# Setup local Kubernetes cluster with Istio, Kiali, and platform namespaces.
# Idempotent — safe to run multiple times.
# Usage: ./scripts/setup-local-k8s.sh

set -euo pipefail

echo "=== Récif Local K8s Setup ==="
echo ""

# --- Step 1: Install tools ---
echo "--- Step 1: Checking K8s tooling ---"

install_if_missing() {
    local cmd=$1
    local formula=${2:-$1}
    if command -v "$cmd" &>/dev/null; then
        echo "  ✓ $cmd already installed ($(command -v "$cmd"))"
    else
        echo "  ⏳ Installing $cmd..."
        brew install "$formula"
        echo "  ✓ $cmd installed"
    fi
}

install_if_missing kubectl kubernetes-cli
install_if_missing helm
install_if_missing istioctl
install_if_missing kubebuilder

echo ""
echo "Tool versions:"
echo "  kubectl:    $(kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -1)"
echo "  helm:       $(helm version --short 2>/dev/null)"
echo "  istioctl:   $(istioctl version --remote=false 2>/dev/null)"
echo "  kubebuilder: $(kubebuilder version 2>/dev/null | head -1)"

# --- Step 2: Start Colima with Kubernetes ---
echo ""
echo "--- Step 2: Starting Colima with Kubernetes ---"

if colima status 2>/dev/null | grep -q "kubernetes.*enabled"; then
    echo "  ✓ Colima already running with Kubernetes"
else
    if colima status &>/dev/null; then
        echo "  ⏳ Colima running but without K8s — restarting with --kubernetes..."
        colima stop
    fi
    echo "  ⏳ Starting Colima with Kubernetes (cpu=4, memory=8GB, disk=60GB)..."
    colima start --kubernetes --cpu 4 --memory 8 --disk 60
    echo "  ✓ Colima started with Kubernetes"
fi

# Verify kubectl works
echo "  Verifying cluster..."
kubectl cluster-info --request-timeout=10s 2>/dev/null && echo "  ✓ Cluster accessible" || {
    echo "  ❌ kubectl cannot reach cluster"
    exit 1
}

# --- Step 3: Install Istio ---
echo ""
echo "--- Step 3: Installing Istio ---"

if kubectl get namespace istio-system &>/dev/null; then
    echo "  ✓ Istio namespace already exists"
    if kubectl get pods -n istio-system -l app=istiod --no-headers 2>/dev/null | grep -q Running; then
        echo "  ✓ istiod is running"
    else
        echo "  ⏳ istiod not running — reinstalling..."
        istioctl install --set profile=demo -y
    fi
else
    echo "  ⏳ Installing Istio (demo profile)..."
    istioctl install --set profile=demo -y
    echo "  ⏳ Waiting for Istio pods to be ready..."
    kubectl wait --for=condition=Ready pods --all -n istio-system --timeout=180s
    echo "  ✓ Istio installed and healthy"
fi

# --- Step 4: Verify Kiali ---
echo ""
echo "--- Step 4: Verifying Kiali ---"

if kubectl get pods -n istio-system -l app=kiali --no-headers 2>/dev/null | grep -q Running; then
    echo "  ✓ Kiali is running"
    echo "  Access: istioctl dashboard kiali"
else
    echo "  ⚠ Kiali not found — it should be included in demo profile"
    echo "  Try: kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.24/samples/addons/kiali.yaml"
fi

# --- Step 5: Create platform namespaces ---
echo ""
echo "--- Step 5: Creating platform namespaces ---"

create_namespace() {
    local ns=$1
    local label=${2:-}
    if kubectl get namespace "$ns" &>/dev/null; then
        echo "  ✓ Namespace $ns already exists"
    else
        kubectl create namespace "$ns"
        echo "  ✓ Created namespace $ns"
    fi
    kubectl label namespace "$ns" istio-injection=enabled --overwrite 2>/dev/null
    if [ -n "$label" ]; then
        kubectl label namespace "$ns" "$label" --overwrite 2>/dev/null
    fi
}

create_namespace recif-system "recif.dev/component=platform"
create_namespace team-default "recif.dev/team=default"

# --- Step 6: Verify & report ---
echo ""
echo "--- Step 6: Verification ---"
echo ""
echo "Namespaces:"
kubectl get namespaces | grep -E "recif-system|team-default|istio-system"
echo ""
echo "Istio pods:"
kubectl get pods -n istio-system --no-headers 2>/dev/null | head -10
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Build Corail image:  cd ../corail && docker build -t corail ."
echo "  2. Install platform:    helm install recif charts/recif/"
echo "  3. Deploy an agent:     recif deploy my-agent"
echo ""
echo "Useful commands:"
echo "  Kiali dashboard:   istioctl dashboard kiali"
echo "  Grafana dashboard: istioctl dashboard grafana"
echo "  Cluster info:      kubectl cluster-info"
echo "  All pods:          kubectl get pods --all-namespaces"
