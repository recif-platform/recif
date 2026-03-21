# CLI Reference

## Installation

```bash
# Build from source
cd recif
go build -o bin/recif ./cmd/recif/...

# Or download binary from GitHub Releases
```

## Commands

### `recif init <name>`

Scaffold a new agent project with `agent.yaml`.

```bash
recif init my-agent
```

### `recif register`

Register an agent from `agent.yaml` with the platform.

```bash
recif register
recif register -f path/to/agent.yaml
```

### `recif list`

List all registered agents.

```bash
recif list
recif list --search "keyword"
recif list --json
```

### `recif status <agent-id>`

Show agent status and version history.

```bash
recif status ag_01ARZ3NDEKTSV4RRFFQ69G5FAV
```

### `recif version`

Print CLI version info.

## Global Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--api-url` | `http://localhost:8080` | Récif API URL |
