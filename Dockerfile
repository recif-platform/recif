FROM golang:1.26-alpine AS builder

# Optional: custom CA certificates (corporate VPN/proxy)
# Drop .crt or .pem files in certs/
COPY certs/ /tmp/certs/
RUN for f in /tmp/certs/*.pem /tmp/certs/*.crt; do \
      [ -f "$f" ] && cp "$f" /usr/local/share/ca-certificates/"$(basename "${f%.*}").crt" || true; \
    done && update-ca-certificates

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /bin/recif-api ./cmd/api/...

FROM alpine:3.21

RUN apk add --no-cache ca-certificates curl

COPY --from=builder /bin/recif-api /bin/recif-api

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/bin/recif-api"]
