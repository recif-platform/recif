.PHONY: dev test test-coverage lint format build build-cli proto-gen migrate-up migrate-down migrate-create sqlc-gen

VERSION ?= dev

DATABASE_URL ?= postgres://recif:recif_dev@localhost:5432/recif?sslmode=disable

dev:
	go run ./cmd/api/...

test:
	go test -race ./...

test-coverage:
	go test -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

lint:
	golangci-lint run ./...

format:
	gofmt -w .

build:
	go build -o bin/recif-api ./cmd/api/...
	go build -ldflags "-X github.com/sciences44/recif/internal/cli.Version=$(VERSION)" -o bin/recif ./cmd/recif/...

build-cli:
	go build -ldflags "-X github.com/sciences44/recif/internal/cli.Version=$(VERSION)" -o bin/recif ./cmd/recif/...

proto-gen:
	@if command -v buf >/dev/null 2>&1; then \
		cd proto && PATH="$$PATH:$$HOME/go/bin" buf generate; \
	else \
		echo "Generating Go gRPC stubs via Docker..."; \
		docker run --rm -v "$$(pwd):/app" -w /app golang:1.26-alpine sh -c '\
			apk add --no-cache protobuf && \
			go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && \
			go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest && \
			mkdir -p gen/control/v1 && \
			protoc --proto_path=proto \
				--go_out=gen --go_opt=paths=source_relative \
				--go-grpc_out=gen --go-grpc_opt=paths=source_relative \
				control/v1/control.proto'; \
	fi

migrate-up:
	goose -dir internal/db/migrations postgres "$(DATABASE_URL)" up

migrate-down:
	goose -dir internal/db/migrations postgres "$(DATABASE_URL)" down

migrate-create:
	goose -dir internal/db/migrations create $(name) sql

sqlc-gen:
	sqlc generate
