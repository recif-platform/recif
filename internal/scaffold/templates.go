package scaffold

import "fmt"

// FrameworkTemplate holds the scaffold templates for a specific framework.
type FrameworkTemplate struct {
	DisplayName  string
	Dockerfile   string
	AgentPy      string
	Requirements string
	DeployYAML   string
}

// frameworkTemplates is the registry of scaffold templates keyed by framework ID.
var frameworkTemplates = map[string]FrameworkTemplate{
	"corail":       corailTemplate(),
	"langchain": langchainTemplate(),
	"crewai":    crewaiTemplate(),
	"autogen":   autogenTemplate(),
}

// LookupTemplate returns the template for a framework, or false if not found.
func LookupTemplate(framework string) (FrameworkTemplate, bool) {
	t, ok := frameworkTemplates[framework]
	return t, ok
}

// --- Shared helpers ---

func sharedDockerfile(requirements string) string {
	return `# syntax=docker/dockerfile:1
FROM python:3.12-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim

WORKDIR /app
COPY --from=builder /install /usr/local
COPY src/ ./src/
COPY recif.yaml .

EXPOSE 8000
CMD ["python", "-m", "src.agent"]
`
}

func deployYAML(framework string) string {
	return fmt.Sprintf(`name: Deploy to Recif

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

      - name: Deploy to Recif
        run: |
          recif deploy \
            --image ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --framework %s \
            --manifest recif.yaml
`, framework)
}

func recifYAML(name, framework string, capabilities []string) string {
	capsStr := ""
	for _, c := range capabilities {
		capsStr += fmt.Sprintf("    - %s\n", c)
	}
	if capsStr == "" {
		capsStr = "    []\n"
	}

	return fmt.Sprintf(`apiVersion: recif.dev/v1alpha1
kind: Agent
metadata:
  name: %s
spec:
  framework: %s
  version: "0.1.0"
  replicas: 1
  capabilities:
%s  resources:
    requests:
      cpu: "250m"
      memory: "512Mi"
    limits:
      cpu: "1"
      memory: "1Gi"
  guards:
    enabled: true
    autoFromCapabilities: true
`, name, framework, capsStr)
}

func readmeContent(name, framework string, capabilities []string) string {
	capsStr := ""
	for _, c := range capabilities {
		capsStr += fmt.Sprintf("- %s\n", c)
	}
	if capsStr == "" {
		capsStr = "(none)\n"
	}

	return fmt.Sprintf(`# %s

Agent scaffolded by Recif.

## Framework

%s

## Capabilities

%s
## Getting Started

1. Install dependencies:

   pip install -r requirements.txt

2. Run locally:

   python -m src.agent

3. Deploy to Recif:

   recif deploy --manifest recif.yaml

## Project Structure

- src/agent.py    — Main agent entrypoint
- src/config.py   — Configuration and capability flags
- recif.yaml      — Agent CRD manifest for Kubernetes deployment
- Dockerfile      — Multi-stage container build
- eval/           — Evaluation datasets and scripts
`, name, framework, capsStr)
}

func goldenJSONL() string {
	return `{"input": "Hello, how are you?", "expected_output": "I'm doing well, thank you for asking!"}
{"input": "What can you help me with?", "expected_output": "I can assist you with a variety of tasks."}
{"input": "Summarize this: The quick brown fox jumps over the lazy dog.", "expected_output": "A fox jumps over a dog."}
`
}

func configPy(capabilities []string) string {
	lines := "CAPABILITIES = {\n"
	allCaps := []string{
		"internet_access", "code_execution", "pii_access",
		"file_system", "database_access", "external_apis", "payments",
	}
	for _, c := range allCaps {
		enabled := "False"
		for _, sel := range capabilities {
			if sel == c {
				enabled = "True"
				break
			}
		}
		lines += fmt.Sprintf("    %q: %s,\n", c, enabled)
	}
	lines += "}\n"
	return lines
}

// --- Framework-specific templates ---

func corailTemplate() FrameworkTemplate {
	return FrameworkTemplate{
		DisplayName: "ADK (Recif Native)",
		Dockerfile:  sharedDockerfile("recif-adk"),
		AgentPy: `"""Recif ADK Agent."""

from recif_adk import Agent, tool


@tool
def greet(name: str) -> str:
    """Greet a user by name."""
    return f"Hello, {name}! Welcome to Recif."


agent = Agent(
    name="my-agent",
    instructions="You are a helpful assistant powered by Recif ADK.",
    tools=[greet],
)

if __name__ == "__main__":
    agent.serve(host="0.0.0.0", port=8000)
`,
		Requirements: `recif-adk>=0.1.0
uvicorn>=0.34.0
pydantic>=2.0
`,
		DeployYAML: deployYAML("corail"),
	}
}

func langchainTemplate() FrameworkTemplate {
	return FrameworkTemplate{
		DisplayName: "LangChain",
		Dockerfile:  sharedDockerfile("langchain"),
		AgentPy: `"""LangChain Agent."""

from langchain.agents import AgentExecutor, create_react_agent
from langchain.tools import tool
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from src.config import CAPABILITIES


@tool
def greet(name: str) -> str:
    """Greet a user by name."""
    return f"Hello, {name}!"


def create_agent() -> AgentExecutor:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    tools = [greet]
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant."),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ])
    agent = create_react_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=True)


if __name__ == "__main__":
    executor = create_agent()
    result = executor.invoke({"input": "Hello!"})
    print(result["output"])
`,
		Requirements: `langchain>=0.3.0
langchain-openai>=0.3.0
langchain-core>=0.3.0
uvicorn>=0.34.0
`,
		DeployYAML: deployYAML("langchain"),
	}
}

func crewaiTemplate() FrameworkTemplate {
	return FrameworkTemplate{
		DisplayName: "CrewAI",
		Dockerfile:  sharedDockerfile("crewai"),
		AgentPy: `"""CrewAI Agent."""

from crewai import Agent, Crew, Task

from src.config import CAPABILITIES


def create_crew() -> Crew:
    researcher = Agent(
        role="Researcher",
        goal="Find accurate and relevant information",
        backstory="You are an expert researcher with attention to detail.",
        verbose=True,
    )

    task = Task(
        description="Research the given topic and provide a summary: {topic}",
        expected_output="A concise summary of findings.",
        agent=researcher,
    )

    return Crew(
        agents=[researcher],
        tasks=[task],
        verbose=True,
    )


if __name__ == "__main__":
    crew = create_crew()
    result = crew.kickoff(inputs={"topic": "agentic AI platforms"})
    print(result)
`,
		Requirements: `crewai>=0.100.0
crewai-tools>=0.30.0
uvicorn>=0.34.0
`,
		DeployYAML: deployYAML("crewai"),
	}
}

func autogenTemplate() FrameworkTemplate {
	return FrameworkTemplate{
		DisplayName: "AutoGen",
		Dockerfile:  sharedDockerfile("autogen"),
		AgentPy: `"""AutoGen Agent."""

import autogen

from src.config import CAPABILITIES


def create_agents():
    config_list = [{"model": "gpt-4o", "api_key": "YOUR_API_KEY"}]

    assistant = autogen.AssistantAgent(
        name="assistant",
        system_message="You are a helpful AI assistant.",
        llm_config={"config_list": config_list},
    )

    user_proxy = autogen.UserProxyAgent(
        name="user_proxy",
        human_input_mode="NEVER",
        max_consecutive_auto_reply=3,
        code_execution_config={"use_docker": False},
    )

    return assistant, user_proxy


if __name__ == "__main__":
    assistant, user_proxy = create_agents()
    user_proxy.initiate_chat(assistant, message="Hello, what can you do?")
`,
		Requirements: `pyautogen>=0.8.0
uvicorn>=0.34.0
`,
		DeployYAML: deployYAML("autogen"),
	}
}
