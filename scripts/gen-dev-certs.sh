#!/usr/bin/env bash
# Generate self-signed mTLS certificates for local development.
# Usage: ./scripts/gen-dev-certs.sh

set -euo pipefail

CERTS_DIR="${1:-certs}"
mkdir -p "$CERTS_DIR"

echo "Generating CA..."
openssl req -x509 -newkey rsa:4096 -days 365 -nodes \
  -keyout "$CERTS_DIR/ca-key.pem" \
  -out "$CERTS_DIR/ca-cert.pem" \
  -subj "/CN=recif-dev-ca" 2>/dev/null

echo "Generating server certificate..."
openssl req -newkey rsa:4096 -nodes \
  -keyout "$CERTS_DIR/server-key.pem" \
  -out "$CERTS_DIR/server-req.pem" \
  -subj "/CN=recif-api" 2>/dev/null

openssl x509 -req -days 365 \
  -in "$CERTS_DIR/server-req.pem" \
  -CA "$CERTS_DIR/ca-cert.pem" \
  -CAkey "$CERTS_DIR/ca-key.pem" \
  -CAcreateserial \
  -out "$CERTS_DIR/server-cert.pem" 2>/dev/null

echo "Generating client certificate..."
openssl req -newkey rsa:4096 -nodes \
  -keyout "$CERTS_DIR/client-key.pem" \
  -out "$CERTS_DIR/client-req.pem" \
  -subj "/CN=corail" 2>/dev/null

openssl x509 -req -days 365 \
  -in "$CERTS_DIR/client-req.pem" \
  -CA "$CERTS_DIR/ca-cert.pem" \
  -CAkey "$CERTS_DIR/ca-key.pem" \
  -CAcreateserial \
  -out "$CERTS_DIR/client-cert.pem" 2>/dev/null

rm -f "$CERTS_DIR"/*.pem.req "$CERTS_DIR"/*.srl "$CERTS_DIR"/*-req.pem

echo "Dev certificates generated in $CERTS_DIR/"
echo "  CA:     $CERTS_DIR/ca-cert.pem"
echo "  Server: $CERTS_DIR/server-cert.pem + $CERTS_DIR/server-key.pem"
echo "  Client: $CERTS_DIR/client-cert.pem + $CERTS_DIR/client-key.pem"
