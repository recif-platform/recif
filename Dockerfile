# syntax=docker/dockerfile:1
# Recif API — Go binary with optional Maree (Python) ingestion CLI.
#
# Standalone build (public repo):
#   docker build -t recif-api .
#
# Monorepo build (with Maree):
#   docker build -f recif/Dockerfile . (from repo root)

# ── Stage 1: build the Go API binary ─────────────────────────────────────────
FROM golang:1.26-alpine AS go-builder

WORKDIR /app

# Optional: custom CA certificates (corporate VPN/proxy)
COPY certs/ /tmp/certs/
RUN for f in /tmp/certs/*.pem /tmp/certs/*.crt; do \
      [ -f "$f" ] && cp "$f" /usr/local/share/ca-certificates/"$(basename "${f%.*}").crt" || true; \
    done && update-ca-certificates || true

COPY go.mod go.sum* ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -o /bin/recif-api ./cmd/api/...

# ── Stage 2: install Maree if present (optional — monorepo only) ─────────────
FROM python:3.13-slim AS maree-builder
WORKDIR /maree
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
    && rm -rf /var/lib/apt/lists/*
# Use a dummy fallback if maree/ doesn't exist in the build context
COPY maree/pyproject.tom[l] maree/README.m[d] ./
COPY maree/mare[e] ./maree/
RUN if [ -f pyproject.toml ]; then \
      pip install --no-cache-dir uv && uv venv /opt/maree-venv && \
      . /opt/maree-venv/bin/activate && uv pip install --no-cache-dir ".[vertex]"; \
    else \
      mkdir -p /opt/maree-venv/bin && echo "Maree not included" > /opt/maree-venv/SKIP; \
    fi

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=go-builder /bin/recif-api /bin/recif-api
COPY --from=maree-builder /opt/maree-venv /opt/maree-venv

ENV PATH="/opt/maree-venv/bin:$PATH" \
    MAREE_BIN="/opt/maree-venv/bin/maree"

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/bin/recif-api"]
