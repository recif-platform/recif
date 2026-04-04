FROM python:3.13-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml uv.lock README.md ./
COPY maree/ maree/
RUN pip install uv && uv sync --no-dev --frozen --extra vertex
ENV PATH="/app/.venv/bin:$PATH"
ENTRYPOINT ["maree"]
