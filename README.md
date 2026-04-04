<p align="center">
  <img src="https://recif-platform.github.io/logo.png" alt="Récif" width="80" />
</p>

<h1 align="center">Récif</h1>

<p align="center">
  <strong>The control tower for autonomous agents.</strong><br/>
  Go API server + Next.js dashboard for the full agent lifecycle:<br/>
  creation, deployment, evaluation, governance, monitoring, and release management.
</p>

<p align="center">
  <a href="https://go.dev"><img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go&logoColor=white" alt="Go 1.22+" /></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js 16" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square" alt="License Apache 2.0" /></a>
  <a href="https://discord.gg/P279TT4ZCp"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

> **⚠️ Alpha Release** — Récif has just been open-sourced. The platform is functional but expect rough edges, breaking changes, and evolving APIs. We're actively looking for **contributors** — whether you're into Go, Python, Kubernetes, React, or AI/ML. Come shape the future of agent operations with us.
>
> **[Join us on Discord →](https://discord.gg/P279TT4ZCp)** · **[Documentation →](https://recif-platform.github.io/docs/introduction)** · **[Quickstart →](https://recif-platform.github.io/docs/quickstart)**

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [API Reference](#api-reference)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Dashboard](#dashboard)
- [Development](#development)
- [License](#license)

---

## Overview

Récif is the governance and orchestration layer of the agentic platform. It manages **Corail** agents through their entire lifecycle -- from scaffolding and deployment to evaluation-gated releases and fleet-wide monitoring. Think of it as the reef that governs the corals.

The platform is Kubernetes-native: each agent runs as an isolated pod managed by the Récif Operator via Agent CRDs.

---

## Architecture

```mermaid
graph TB
    subgraph "Récif Platform"
        API["Récif API<br/><small>Go · :8080</small>"]
        Dashboard["Dashboard<br/><small>Next.js · :3000</small>"]
    end

    subgraph "Data Layer"
        PG["PostgreSQL<br/><small>pgvector · :5432</small>"]
        Git["recif-state<br/><small>Git repo · artifacts</small>"]
    end

    subgraph "Kubernetes Cluster"
        K8s["K8s API Server"]
        Agents["Corail Agent Pods"]
        Flagger["Flagger<br/><small>canary controller</small>"]
    end

    MLflow["MLflow<br/><small>traces + eval</small>"]

    Dashboard -- "REST / SSE" --> API
    API -- "pgx" --> PG
    API -- "git push" --> Git
    API -- "dynamic client" --> K8s
    API -- "gRPC / HTTP proxy" --> Agents
    API -- "HTTP" --> MLflow
    K8s -- "manages" --> Agents
    Flagger -- "webhook" --> API
```

---

## Key Features

<details>
<summary><strong>Agent Lifecycle</strong></summary>

- Full CRUD with K8s CRD integration (create, deploy, stop, restart, delete)
- Version tracking and configuration management
- Scaffold generator for new agent projects
- SSE event streaming for real-time deployment status

</details>

<details>
<summary><strong>Evaluation-Driven Releases</strong></summary>

- 14 MLflow scorers (correctness, faithfulness, relevance, toxicity, etc.)
- Evaluation datasets with golden question/answer pairs
- Quality gates: releases blocked until eval scores pass thresholds
- Release pipeline: `pending_eval` &rarr; `approved` / `rejected`
- Side-by-side evaluation comparison across runs

</details>

<details>
<summary><strong>Canary Deployments</strong></summary>

- Progressive traffic shifting via Flagger
- Webhook quality gate integrated with evaluation scores
- One-click promote or rollback

</details>

<details>
<summary><strong>Governance</strong></summary>

- 4-dimension scorecards: Quality (35%), Safety (30%), Cost (20%), Compliance (15%)
- Guardrail policies with configurable rules and enforcement levels
- Risk profiles per agent

</details>

<details>
<summary><strong>AI Radar</strong></summary>

- Fleet-wide agent health monitoring
- Per-agent detail views with metrics and alerts
- Anomaly detection across the agent fleet

</details>

<details>
<summary><strong>Feedback Loop</strong></summary>

- User thumbs up/down on agent responses
- Auto-append feedback to golden evaluation datasets
- Continuous quality improvement through re-evaluation

</details>

<details>
<summary><strong>Multi-Tenant & Auth</strong></summary>

- JWT authentication with OIDC provider support
- RBAC with 4 roles (admin, manager, developer, viewer)
- Team management with namespace isolation
- Per-team agent and resource scoping

</details>

<details>
<summary><strong>Knowledge Bases & Memory</strong></summary>

- RAG knowledge base management (Mar&eacute;e pipeline integration)
- Document ingestion and semantic search
- Agent memory with pgvector semantic search
- Memory status, store, search, and delete operations

</details>

<details>
<summary><strong>Integrations & Skills</strong></summary>

- MCP, HTTP, and CLI tool integrations with connection testing
- Skills marketplace: create, import, update, assign to agents
- Platform configuration and sync

</details>

---

## API Reference

The API server exposes **~60 endpoints** under `/api/v1`. Key groups:

| Group | Prefix | Description |
|-------|--------|-------------|
| **Agents** | `/api/v1/agents` | CRUD, deploy, stop, restart, config, versions |
| **Releases** | `/api/v1/agents/{id}/releases` | Create, list, diff, deploy, eval-gate |
| **Evaluations** | `/api/v1/agents/{id}/evaluations` | Trigger runs, compare, manage datasets |
| **Canary** | `/api/v1/agents/{id}/canary` | Start, status, promote, rollback |
| **Memory** | `/api/v1/agents/{id}/memory` | Store, search, list, delete memories |
| **Chat** | `/api/v1/agents/{id}/chat` | Proxy to Corail agent, SSE streaming |
| **Conversations** | `/api/v1/agents/{id}/conversations` | History, detail, status, delete |
| **Governance** | `/api/v1/governance` | Scorecards and guardrail policies |
| **Radar** | `/api/v1/radar` | Fleet overview, per-agent detail, alerts |
| **Feedback** | `/api/v1/feedback` | User feedback submission |
| **Knowledge Bases** | `/api/v1/knowledge-bases` | CRUD, ingest documents, search |
| **Integrations** | `/api/v1/integrations` | CRUD, test connection, list types |
| **Skills** | `/api/v1/skills` | CRUD, import from marketplace |
| **Teams** | `/api/v1/teams` | CRUD, members, roles |
| **Platform** | `/api/v1/platform` | Config, test connection, sync |
| **Webhooks** | `/api/v1/webhooks` | Flagger canary quality gate |

---

## Quick Start

### Kubernetes (Kind)

```bash
# Prerequisites: Docker, Kind, Helm, kubectl

# One-command local setup
cd deploy/kind
./setup.sh

# Port-forward services
kubectl port-forward svc/recif-api 8080:8080 -n recif-system &
kubectl port-forward svc/recif-dashboard 3000:3000 -n recif-system &

# Verify
curl http://localhost:8080/healthz
# → {"status":"ok"}
```

### Local Development

```bash
# Prerequisites: Go 1.22+, PostgreSQL, Node.js 20+

# Clone and setup
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
make migrate-up

# Start the API server
make dev

# Start the dashboard (separate terminal)
cd dashboard
npm install
npm run dev
```

### Docker

```bash
docker build -t recif-api .
docker run -p 8080:8080 \
  -e DATABASE_URL="postgres://recif:recif_dev@host.docker.internal:5432/recif?sslmode=disable" \
  recif-api
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV_PROFILE` | `dev` | Environment profile: `dev`, `test`, `prod` |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `RECIF_PORT` | `8080` | API server port |
| `DASHBOARD_PORT` | `3000` | Dashboard port |
| `AUTH_ENABLED` | `false` | Enable JWT authentication |
| `JWT_SECRET` | — | Secret for JWT signing (required in prod) |
| `OIDC_ISSUER_URL` | — | OpenID Connect issuer URL |
| `OIDC_CLIENT_ID` | — | OIDC client ID |
| `OIDC_CLIENT_SECRET` | — | OIDC client secret |
| `CORAIL_GRPC_ADDR` | `localhost:50051` | Corail agent gRPC address |
| `MTLS_CERT_PATH` | — | mTLS certificate path (Récif-Corail) |
| `MTLS_KEY_PATH` | — | mTLS private key path |
| `MTLS_CA_PATH` | — | mTLS CA certificate path |
| `LOG_LEVEL` | `debug` | Log level: `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `text` | Log format: `text`, `json` |
| `OTEL_EXPORTER` | `stdout` | OpenTelemetry exporter: `stdout`, `otlp` |
| `OTEL_ENDPOINT` | — | OTLP collector endpoint |
| `RATE_LIMIT_RPS` | `100` | Rate limit: requests per second |
| `RATE_LIMIT_BURST` | `200` | Rate limit: burst size |

---

## Dashboard

The Next.js dashboard provides a visual interface for the entire platform:

- **Agent Studio** -- Create, configure, and deploy agents
- **Chat** -- SSE-powered conversation with AG-UI rich rendering (code blocks, charts, tables, artifacts)
- **Releases** -- Visual release pipeline with eval gates
- **Governance** -- Scorecard dashboards and policy editor
- **AI Radar** -- Fleet health monitoring with alert feeds
- **Knowledge Bases** -- Document management and search
- **Skills** -- Browse and assign from the marketplace
- **Teams** -- Member management and role assignment

Built with the **reef-glass design system**: ocean dark theme, translucent panels, volume shadows, and caustic lighting effects.

```bash
cd dashboard
npm install
npm run dev    # http://localhost:3000
```

---

## Development

```bash
# Run API server
make dev

# Run tests
make test

# Run tests with coverage
make test-coverage

# Lint
make lint

# Format
make format

# Build API + CLI binaries
make build

# Build CLI only
make build-cli

# Generate protobuf stubs
make proto-gen

# Database migrations
make migrate-up
make migrate-down
make migrate-create name=add_new_table

# Generate SQL queries (sqlc)
make sqlc-gen
```

### Project Structure

```
recif/
├── cmd/
│   ├── api/          # API server entrypoint
│   └── recif/        # CLI entrypoint
├── internal/
│   ├── agent/        # Agent CRUD service
│   ├── auth/         # JWT + OIDC authentication
│   ├── audit/        # Audit logging
│   ├── cache/        # Caching layer
│   ├── canary/       # Canary deployment handler  (Flagger)  (Flagger)
│   ├── cli/          # CLI commands
│   ├── config/       # Configuration loading
│   ├── db/           # Database migrations + queries
│   ├── eval/         # Evaluation engine (MLflow)
│   ├── evaluation/   # Evaluation datasets + runs
│   ├── eventbus/     # Internal event bus
│   ├── feedback/     # User feedback loop
│   ├── gitstate/     # Git state repo (release artifacts)
│   ├── governance/   # Scorecards + policies
│   ├── grpc/         # gRPC client (Corail)
│   ├── httputil/     # HTTP response helpers
│   ├── integration/  # Tool integrations (MCP, HTTP, CLI)
│   ├── kb/           # Knowledge base management
│   ├── observability/# OpenTelemetry setup
│   ├── platform/     # Platform config
│   ├── radar/        # AI Radar monitoring
│   ├── release/      # Release pipeline
│   ├── scaffold/     # Agent project scaffolding
│   ├── server/       # HTTP server + routes + middleware
│   ├── skill/        # Skills marketplace
│   └── team/         # Team + RBAC management
├── dashboard/        # Next.js frontend
├── proto/            # Protobuf definitions
├── gen/              # Generated protobuf stubs
├── charts/           # Helm charts
├── scripts/          # Dev + CI scripts
├── docs/             # Documentation
└── widget/           # Embeddable chat widget
```

---

## License

[Apache License 2.0](LICENSE)
