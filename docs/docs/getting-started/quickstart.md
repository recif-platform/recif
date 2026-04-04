# Quickstart

Get Récif running on Kubernetes in 5 minutes.

## Prerequisites

- Docker + Colima installed (`brew install colima`)
- Both repos cloned side-by-side:

```
parent/
├── recif/
└── corail/
```

## 1. Setup K8s cluster with Istio

```bash
cd recif
./scripts/setup-local-k8s.sh
```

This installs kubectl, helm, istioctl, kubebuilder, starts Colima with K8s, and installs Istio + Kiali.

## 2. Install the platform

```bash
helm install recif charts/recif/ --namespace recif-system --create-namespace
```

## 3. Build the Corail agent image

```bash
cd ../corail
docker build -t corail:v2 .
```

## 4. Create and deploy your first agent

```bash
cd ../recif

# Build CLI
go build -o bin/recif ./cmd/recif/...

# Scaffold agent project
./bin/recif init my-first-agent
cd my-first-agent

# Deploy to Kubernetes
../bin/recif deploy --namespace team-default
```

## 5. Verify the agent is running

```bash
kubectl get agents -n team-default
# NAME              PHASE     REPLICAS   ENDPOINT
# my-first-agent    Running   1          http://agents.localhost/my-first-agent/
```

## 6. Chat with your agent

```bash
# Port-forward to the agent
kubectl port-forward -n team-default svc/my-first-agent 8000:8000

# Chat
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello!"}'
# → {"output": "Echo: Hello!"}
```

## 7. Explore the platform

- **Kiali (topology):** `istioctl dashboard kiali`
- **Dashboard:** Deploy the Next.js dashboard for a visual interface
- **Widget:** Embed the chat widget on any page

## Teardown

```bash
# Remove platform
helm uninstall recif -n recif-system

# Stop cluster
./scripts/teardown-local-k8s.sh
```
