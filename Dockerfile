# Multi-stage build that bundles the recif-api Go binary together with the
# Marée (Python) ingestion CLI so the API can shell out to `maree ingest`
# when documents are uploaded.
#
# IMPORTANT: build context must be the repository root so both recif/ and
# maree/ are reachable, e.g. `docker build -f recif/Dockerfile .` run from
# the repo root.

# ── Stage 1: build the Go API binary ─────────────────────────────────────────
FROM golang:1.26-alpine AS go-builder

WORKDIR /app

# Optional: custom CA certificates (corporate VPN/proxy)
COPY recif/certs/ /tmp/certs/
RUN for f in /tmp/certs/*.pem /tmp/certs/*.crt; do \
      [ -f "$f" ] && cp "$f" /usr/local/share/ca-certificates/"$(basename "${f%.*}").crt" || true; \
    done && update-ca-certificates || true

COPY recif/go.mod recif/go.sum* ./
RUN go mod download
COPY recif/ .
RUN CGO_ENABLED=0 go build -o /bin/recif-api ./cmd/api/...

# ── Stage 2: install Marée (Python) into a dedicated venv ───────────────────
FROM python:3.13-slim AS maree-builder
WORKDIR /maree
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY maree/pyproject.toml maree/README.md ./
COPY maree/maree ./maree
RUN pip install --no-cache-dir uv && uv venv /opt/maree-venv && \
    . /opt/maree-venv/bin/activate && uv pip install --no-cache-dir ".[vertex]"

# ── Stage 3: runtime — slim Python base with Go binary + Marée venv ─────────
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
