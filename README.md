<p align="center">
  <img src="https://recif-platform.github.io/logo.png?v=2" alt="Recif" width="80" />
</p>

<h1 align="center">Recif</h1>

<p align="center">
  <strong>The control tower for autonomous AI agents.</strong>
</p>

<p align="center">
  <a href="https://github.com/recif-platform/recif/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square" alt="License" /></a>
  <a href="https://github.com/recif-platform/recif/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/recif-platform/recif/ci.yml?style=flat-square&label=CI" alt="CI" /></a>
  <img src="https://img.shields.io/badge/version-v0.2.0-green?style=flat-square" alt="Version" />
  <a href="https://discord.gg/P279TT4ZCp"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

---

Recif is the governance and orchestration layer of the [Recif platform](https://github.com/recif-platform). It provides a Go API server and a Next.js dashboard for the full agent lifecycle: creation, deployment, evaluation-gated releases, canary rollouts, knowledge base management, and fleet-wide monitoring. Kubernetes CRDs are the source of truth -- the API reads and writes Agent specs directly to the K8s API, and the operator reconciles them into running containers.

---

## Quick Start

### Kubernetes (Helm)

```bash
# Prerequisites: Kubernetes cluster, Helm 3, kubectl

# Add the Helm chart
helm install recif charts/recif/ -n recif-system --create-namespace

# Set up admin credentials
kubectl create secret generic recif-api-secrets -n recif-system \
  --from-literal=JWT_SECRET="$(openssl rand -base64 32)" \
  --from-literal=ADMIN_EMAIL="you@example.com" \
  --from-literal=ADMIN_PASSWORD="your-password" \
  --from-literal=ADMIN_NAME="Your Name"

# Enable authentication
kubectl set env deployment/recif-api AUTH_ENABLED=true -n recif-system

# Access the platform
kubectl port-forward svc/recif-api 8080:8080 -n recif-system &
kubectl port-forward svc/recif-dashboard 3000:3000 -n recif-system &

# Open http://localhost:3000 and login
```

See the [Helm chart docs](https://github.com/recif-platform/helm-charts) for full configuration (Ollama, Vertex AI, MLflow, etc.).

### Local Development

```bash
# Prerequisites: Go 1.26+, PostgreSQL, Node.js 22+

# API
DATABASE_URL="postgres://recif:recif_dev@localhost:5432/recif?sslmode=disable" \
  go run ./cmd/api/...

# Dashboard (separate terminal)
cd dashboard && npm install && npm run dev
```

### Docker

```bash
# Build from the repo root (needs both recif/ and maree/ directories)
docker build -f Dockerfile -t recif-api ..

docker run -p 8080:8080 \
  -e DATABASE_URL="postgres://recif:recif_dev@host.docker.internal:5432/recif?sslmode=disable" \
  recif-api
```

---

## Key Features

- **Agent lifecycle management** -- Full CRUD with K8s CRD integration. Create, deploy, stop, restart, delete agents through the API or dashboard.
- **Evaluation-driven releases** -- 14 MLflow scorers, golden datasets, quality gates. Releases are blocked until eval scores pass thresholds.
- **Canary deployments** -- Progressive traffic shifting via Flagger with webhook quality gates. One-click promote or rollback.
- **Knowledge base management** -- RAG knowledge bases with document ingestion, semantic search, and pgvector storage.
- **Governance layer** -- 4-dimension scorecards (quality, safety, cost, compliance) and guardrail policies with configurable enforcement.
- **AI Radar** -- Fleet-wide agent health monitoring with per-agent detail views, metrics, and anomaly detection.
- **Secret management** -- Three modes: inline Helm values, External Secrets Operator, or GCP Workload Identity.
- **Next.js dashboard** -- Agent studio, SSE-powered chat with AG-UI rendering, release pipeline, governance dashboards, and team management.

---

## Architecture

```
+---------------------------------------------------------------+
|                        Recif Platform                         |
|                                                               |
|   +-----------------+         +------------------+            |
|   |   Dashboard     |  REST   |    Recif API     |            |
|   |   (Next.js)     |-------->|    (Go, :8080)   |            |
|   |   :3000         |   SSE   |                  |            |
|   +-----------------+         +--------+---------+            |
|                                        |                      |
|                     +------------------+------------------+   |
|                     |                  |                  |   |
|                     v                  v                  v   |
|              +------------+    +-------------+    +---------+ |
|              | K8s API    |    | PostgreSQL  |    | MLflow  | |
|              | (CRDs =    |    | + pgvector  |    | (eval)  | |
|              |  source of |    | (ops data)  |    |         | |
|              |  truth)    |    +-------------+    +---------+ |
|              +-----+------+                                   |
|                    |                                          |
|                    v                                          |
|              +------------+                                   |
|              |  Operator  |                                   |
|              +-----+------+                                   |
|                    |                                          |
|          +---------+---------+                                |
|          v         v         v                                |
|     +---------+---------+---------+                           |
|     | Agent   | Agent   | Agent   |                           |
|     | (Corail)| (Corail)| (Corail)|                           |
|     +---------+---------+---------+                           |
+---------------------------------------------------------------+
```

---

## API Reference

The API server exposes ~60 endpoints under `/api/v1`. Key groups:

| Group | Prefix | Description |
|-------|--------|-------------|
| Agents | `/api/v1/agents` | CRUD, deploy, stop, restart, config |
| Releases | `/api/v1/agents/{id}/releases` | Create, diff, deploy, eval-gate |
| Evaluations | `/api/v1/agents/{id}/evaluations` | Trigger runs, compare, datasets |
| Canary | `/api/v1/agents/{id}/canary` | Start, status, promote, rollback |
| Chat | `/api/v1/agents/{id}/chat` | Proxy to Corail agent, SSE streaming |
| Governance | `/api/v1/governance` | Scorecards and guardrail policies |
| Radar | `/api/v1/radar` | Fleet overview, per-agent detail |
| Knowledge Bases | `/api/v1/knowledge-bases` | CRUD, ingest, search |
| Teams | `/api/v1/teams` | CRUD, members, roles |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | -- | PostgreSQL connection string |
| `RECIF_PORT` | `8080` | API server port |
| `AUTH_ENABLED` | `false` | Enable JWT authentication |
| `JWT_SECRET` | -- | JWT signing secret (required in prod) |
| `OIDC_ISSUER_URL` | -- | OpenID Connect issuer URL |
| `LOG_LEVEL` | `debug` | Log level: `debug`, `info`, `warn`, `error` |

See the full [configuration reference](https://recif-platform.github.io/docs) in the documentation.

---

## Related Repositories

| Repository | Description |
|------------|-------------|
| [corail](https://github.com/recif-platform/corail) | Python agent runtime -- the engine inside every agent pod |
| [recif-operator](https://github.com/recif-platform/recif-operator) | Kubernetes operator -- turns Agent CRDs into running containers |
| [helm-charts](https://github.com/recif-platform/helm-charts) | Helm chart for one-command platform installation |

---

## Roadmap

### Core Platform

| Feature | Status | Description |
|---------|:------:|-------------|
| Agent CRUD + CRDs | 🟢 | Create, deploy, stop, restart agents via API and dashboard |
| Multi-LLM providers | 🟢 | Vertex AI, OpenAI, Anthropic, Bedrock, Ollama, Google AI (7 providers) |
| SSE streaming chat | 🟢 | Real-time agent responses with AG-UI rich rendering |
| Knowledge Bases (RAG) | 🟢 | Document ingestion, semantic chunking, pgvector, agentic retrieval |
| Eval-driven releases | 🟢 | MLflow GenAI, 14 scorers, golden datasets, quality gates |
| Canary deployments | 🟢 | Istio traffic splitting, Flagger webhooks, one-click promote/rollback |
| Secret management | 🟢 | 3 modes: inline, External Secrets (Vault/GCP SM/AWS), Workload Identity |
| Helm one-command install | 🟢 | Full platform in a single `helm install` |

| Authentication & RBAC | 🟢 | JWT login, user management, role-based access (admin/developer/viewer) |
| Teams & access control | 🟢 | Team CRUD in PostgreSQL, member management, agent visibility per team, K8s namespace per team |
| Discord feedback | 🟢 | 👍/👎 reactions logged to MLflow, universal tracing across all channels |
| E2E test suite | 🟢 | 46 Playwright tests + Go unit tests, CI pipeline on every push |

### In Progress

| Feature | Status | Description |
|---------|:------:|-------------|
| Agent Marketplace | 🟠 | Users browse and subscribe to published agents |
| Agent publish flow | 🟠 | Creator tests, evaluates, then publishes to marketplace |
| Governance scorecards | 🟡 | 4-dimension scoring (quality, safety, cost, compliance) |
| Agent memory inheritance | 🟡 | Versioned memory artifacts, inheritable across agents |

### Planned

| Feature | Status | Description |
|---------|:------:|-------------|
| Team switcher | 🔴 | Users in multiple teams can switch context from the topbar (like GitHub org switcher) |
| Multi-tenant namespaces | 🔴 | Per-team resource quotas, network policies, and full RBAC isolation |
| Self-registration | 🔴 | Public sign-up page, email verification, admin approval flow |
| MCP tool marketplace | 🔴 | Share and discover MCP-compatible tools across teams |
| Prompt registry | 🔴 | Versioned prompt templates synced to MLflow |
| Cost tracking | 🔴 | Per-agent token usage, budget alerts, cost allocation |
| Audit trail | 🔴 | Full audit log for compliance (who changed what, when) |
| Distributed event bus | 🔵 | Agent-to-agent communication, pub/sub, choreography |

> 🟢 Done  🟠 In progress  🟡 Designed  🔴 Planned  🔵 Future (architecture ready, market-driven)

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Write tests for new functionality
4. Ensure `make lint` and `make test` pass
5. Submit a pull request

---

## Links

- [Documentation](https://recif-platform.github.io/docs)
- [Discord](https://discord.gg/P279TT4ZCp)
- [GitHub Organization](https://github.com/recif-platform)

---

## License

[Apache License 2.0](LICENSE) -- Copyright 2026 Sciences44.
