# Recif -- Open-Source Agentic AI Platform

> Deploy, govern, and operate AI agents at scale -- any model, any cloud.

Recif is a Kubernetes-native platform for building, deploying, and managing autonomous AI agents in production. It combines a powerful agent runtime (Corail) with a full governance layer -- scorecards, guardrails, monitoring -- and a rich visual dashboard. Unlike point solutions, Recif gives you the complete lifecycle: create agents with no-code or custom code, connect them to enterprise tools, feed them knowledge via RAG, and operate them with real-time observability. Ship agents the way you ship microservices.

## Architecture

```
                         +------------------+
                         |    Dashboard     |
                         |   (Next.js)      |
                         +--------+---------+
                                  |
                                  v
                         +------------------+
                         |   Recif API      |
                         |   (Go)           |
                         +--------+---------+
                                  |
                    +-------------+-------------+
                    |                           |
                    v                           v
           +----------------+          +----------------+
           | Recif Operator |          |   PostgreSQL   |
           | (K8s CRDs)     |          |   + pgvector   |
           +-------+--------+          +----------------+
                   |
        +----------+----------+
        |          |          |
        v          v          v
   +---------+ +---------+ +---------+
   | Agent   | | Agent   | | Agent   |
   | Pod     | | Pod     | | Pod     |
   | (Corail)| | (Corail)| | (Corail)|
   +---------+ +---------+ +---------+
        |
        v
   +---------+
   | Ollama  |
   | / LLMs  |
   +---------+
```

## Key Features

- **Multi-model**: Ollama, Anthropic, AWS Bedrock, Vertex AI, Google AI, OpenAI
- **Skills system**: Anthropic-compatible skill packages (SKILL.md + scripts + references)
- **Rich AG-UI**: 3D scenes, charts, flow diagrams, mermaid, HTML -- agents produce visual content
- **Knowledge Base**: RAG with pgvector, connectors (Drive, Jira, Confluence, Databricks)
- **Agent Memory**: Persistent semantic memory with pgvector
- **Governance**: Scorecards (quality/safety/cost/compliance) + guardrail policies
- **AI Radar**: Real-time monitoring (health, latency, tokens, cost, alerts)
- **Integrations**: GitHub, Jira, Jenkins, Slack, AWS, GCP, Datadog, Terraform
- **Dual-track creation**: No-code (ready-to-use) or scaffolded custom dev (any framework)
- **Kubernetes-native**: CRDs, operator, Helm chart, namespace-per-team
- **Dark/Light mode**: Reef Depth (ocean dark) / Reef Lagoon (light)

## Quick Start

### Local (Kind + Helm)

```bash
git clone https://github.com/recif-platform/recif.git
cd recif

# If behind a corporate proxy/VPN (Zscaler, Netskope, etc.):
./scripts/install-cert.sh /path/to/your-ca.crt

cd deploy/kind
bash setup.sh
```

Then:

```bash
kubectl port-forward svc/recif-api 8080:8080 -n recif-system
kubectl port-forward svc/recif-dashboard 3000:3000 -n recif-system
```

Open http://localhost:3000

### Cloud (Terraform + AWS)

```bash
cd deploy/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply
```

## Project Structure

```
agentic-platform/
├── corail/          # Agent runtime (Python)
├── recif/           # API + Dashboard + CLI (Go + Next.js)
├── recif-operator/  # Kubernetes operator (Go)
├── maree/           # Ingestion pipeline (Python)
├── skills/          # Skill packages (Anthropic format)
├── deploy/
│   ├── helm/        # Helm chart
│   ├── kind/        # Local dev setup
│   └── terraform/   # Cloud infrastructure
└── docs/            # Documentation (Docusaurus)
```

## Components

| Component | Language | Description |
|-----------|----------|-------------|
| **Corail** | Python | Autonomous agent runtime -- strategies, tools, skills, memory, guards |
| **Recif API** | Go | REST API, agent proxy, governance, integrations |
| **Recif Operator** | Go | Kubernetes operator -- Agent & Tool CRDs |
| **Dashboard** | Next.js | Web UI -- chat, management, monitoring |
| **Maree** | Python | Document ingestion pipeline for RAG |

## Roadmap

| Feature | Status | Target |
|---------|--------|--------|
| Agent runtime (Corail) — ReAct, planning, memory, guards, skills | Done | v0.1 |
| Multi-model (Ollama, Anthropic, Bedrock, Vertex AI, OpenAI) | Done | v0.1 |
| Skills system (Anthropic SKILL.md format, import from GitHub) | Done | v0.1 |
| Knowledge Base + RAG (pgvector, connectors) | Done | v0.1 |
| Governance (scorecards, guardrail policies) | Done | v0.1 |
| AI Radar (health, latency, cost, alerts) | Done | v0.1 |
| Integrations (GitHub, Jira, Jenkins, Slack, AWS, GCP, Datadog, Terraform) | Done | v0.1 |
| Dark/Light mode | Done | v0.1 |
| Dual-track agent creation (no-code + custom dev scaffold) | Done | v0.1 |
| Helm chart + Kind local setup + Terraform (EKS/RDS) | Done | v0.1 |
| gRPC control plane proto (defined, stubs generated) | Done | v0.1 |
| Auth + Teams (JWT, RBAC, namespace-per-team, multi-tenant) | Planned | v0.2 |
| GitOps deployment (ArgoCD / FluxCD integration) | Planned | v0.2 |
| Async gRPC control plane (replace HTTP proxy) | Planned | v0.2 |
| Channels (Slack, WebSocket, Google Chat) | Planned | v0.2 |
| Agent Marketplace / Templates (pre-built agents catalog) | Planned | v0.2 |
| CLI `recif` (init, deploy, eval, radar) | Planned | v0.2 |
| Evaluation (MLflow, golden datasets, quality gates, staging) | Planned | v0.2 |
| Human-in-the-Loop (full pause/resume flow) | Planned | v0.2 |
| Memory Inheritance (fork/merge across agents) | Planned | v0.3 |
| Cron / Scheduled agents | Planned | v0.3 |
| Webhooks / Event hooks | Planned | v0.3 |
| Multi-cluster deployment | Planned | v0.3 |
| Knowledge Graph (beyond flat memory) | Planned | v0.3 |

## Documentation

See [docs/](./docs/) or visit the documentation site.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache 2.0 -- see [LICENSE](./LICENSE).
