FROM node:22-alpine AS builder

# Optional: custom CA certificates (corporate VPN/proxy)
# Drop .crt or .pem files in certs/
COPY certs/ /tmp/certs/
RUN apk add --no-cache ca-certificates && \
    for f in /tmp/certs/*.pem /tmp/certs/*.crt; do \
      [ -f "$f" ] && cp "$f" /usr/local/share/ca-certificates/"$(basename "${f%.*}").crt" || true; \
    done && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
