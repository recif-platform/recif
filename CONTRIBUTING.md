# Contributing to Recif

Thank you for your interest in contributing to Recif! This guide will help you get started.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.22+ | Recif API, Operator |
| Python | 3.13+ | Corail runtime, Maree |
| Node.js | 20+ | Dashboard |
| Docker | 24+ | Container builds |
| Kind | 0.20+ | Local Kubernetes |
| Helm | 3.14+ | Deployment |
| kubectl | 1.29+ | Cluster management |

## Setting Up the Dev Environment

### 1. Clone the repository

```bash
git clone https://github.com/recif-platform/recif.git
cd recif
```

### 2. Start local infrastructure

```bash
cd deploy/kind
bash setup.sh
```

This creates a Kind cluster with PostgreSQL, pgvector, and Ollama.

### 3. Run components locally

**Recif API (Go)**

```bash
cd recif
go run ./cmd/api
```

**Dashboard (Next.js)**

```bash
cd recif/dashboard
npm install
npm run dev
```

**Corail Agent (Python)**

```bash
cd corail
pip install -e ".[dev]"
corail serve
```

**Maree Pipeline (Python)**

```bash
cd maree
pip install -e ".[dev]"
```

## Code Style

### Go (Recif API, Operator)

- Standard Go formatting (`gofmt` / `goimports`)
- Run `go vet ./...` before committing
- Follow [Effective Go](https://go.dev/doc/effective_go)

### Python (Corail, Maree)

- Formatter and linter: **ruff**
- Run `ruff check .` and `ruff format .` before committing
- Type hints are required on all public functions

### TypeScript (Dashboard)

- Linter: **ESLint** with the project config
- Run `npm run lint` before committing
- Use functional components with TypeScript interfaces

## Architecture Principles

### Registry Pattern (Mandatory)

All extensible subsystems MUST use the registry pattern. This means:

- **No `if/elif` chains** for selecting implementations
- New implementations are registered via decorators or registration functions
- Lookup is done through a registry dictionary

**Bad:**

```python
if provider == "anthropic":
    return AnthropicProvider()
elif provider == "openai":
    return OpenAIProvider()
elif provider == "ollama":
    return OllamaProvider()
```

**Good:**

```python
PROVIDER_REGISTRY: dict[str, type[Provider]] = {}

def register_provider(name: str):
    def decorator(cls):
        PROVIDER_REGISTRY[name] = cls
        return cls
    return decorator

@register_provider("anthropic")
class AnthropicProvider(Provider): ...

@register_provider("openai")
class OpenAIProvider(Provider): ...

# Lookup
provider_cls = PROVIDER_REGISTRY[provider_name]
```

The same principle applies in Go (use maps of factory functions) and TypeScript (use object maps or `Map`).

## Submitting Pull Requests

1. **Fork** the repository and create a feature branch from `main`:

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes.** Keep commits focused and atomic.

3. **Test your changes:**

   ```bash
   # Go
   cd recif && go test ./...
   cd recif-operator && go test ./...

   # Python
   cd corail && pytest tests/ -x -q
   cd maree && pytest tests/ -x -q

   # Dashboard
   cd recif/dashboard && npm run lint && npm run build
   ```

4. **Write a clear PR description** explaining what changed and why.

5. **Submit the PR** against the `main` branch.

### PR Checklist

- [ ] Code follows the project style guides
- [ ] No `if/elif` chains for extensible logic (registry pattern used)
- [ ] Tests pass locally
- [ ] New features include tests
- [ ] Documentation updated if needed

## Reporting Issues

Open an issue on GitHub with:

- A clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Environment details (OS, versions)

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
