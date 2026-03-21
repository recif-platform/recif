package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/spf13/cobra"
)

var registerFile string

var registerCmd = &cobra.Command{
	Use:   "register",
	Short: "Register an agent from agent.yaml with the Récif platform",
	RunE: func(_ *cobra.Command, _ []string) error {
		// Read YAML file
		data, err := os.ReadFile(registerFile) //nolint:gosec // user-specified file
		if err != nil {
			return fmt.Errorf("cannot read %s: %w", registerFile, err)
		}

		// Validate
		agent, err := ValidateAgentYAML(data)
		if err != nil {
			return fmt.Errorf("invalid agent.yaml:\n%w", err)
		}

		// Build request body
		body := map[string]any{
			"name":        agent.Name,
			"framework":   agent.Framework,
			"description": agent.Description,
			"version":     agent.Version,
			"config":      agent.Config,
		}
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}

		// POST to API
		client := &http.Client{Timeout: 5 * time.Second}
		url := apiURL + "/api/v1/agents"
		resp, err := client.Post(url, "application/json", bytes.NewReader(jsonBody))
		if err != nil {
			return fmt.Errorf("API request failed: %w", err)
		}
		defer func() { _ = resp.Body.Close() }()

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("read response: %w", err)
		}

		if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
			return fmt.Errorf("registration failed (HTTP %d): %s", resp.StatusCode, string(respBody))
		}

		isNew := resp.StatusCode == http.StatusCreated

		// Parse response to show ID
		var result struct {
			Data struct {
				ID     string `json:"id"`
				Name   string `json:"name"`
				Status string `json:"status"`
			} `json:"data"`
		}
		if err := json.Unmarshal(respBody, &result); err == nil {
			if isNew {
				fmt.Printf("Agent registered successfully!\n")
			} else {
				fmt.Printf("Agent updated — new version created!\n")
			}
			fmt.Printf("  ID:     %s\n", result.Data.ID)
			fmt.Printf("  Name:   %s\n", result.Data.Name)
			fmt.Printf("  Status: %s\n", result.Data.Status)
		} else {
			fmt.Printf("Agent registered: %s\n", string(respBody))
		}

		return nil
	},
}

func init() {
	registerCmd.Flags().StringVarP(&registerFile, "file", "f", "agent.yaml", "Path to agent YAML file")
}
