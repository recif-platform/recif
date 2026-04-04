package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status <agent-id>",
	Short: "Show agent status and version history",
	Args:  cobra.ExactArgs(1),
	RunE: func(_ *cobra.Command, args []string) error {
		agentID := args[0]

		client := &http.Client{Timeout: 5 * time.Second}

		// Get agent info
		agentResp, err := client.Get(apiURL + "/api/v1/agents/" + agentID)
		if err != nil {
			return fmt.Errorf("API request failed: %w", err)
		}
		defer func() { _ = agentResp.Body.Close() }()

		if agentResp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(agentResp.Body)
			return fmt.Errorf("agent not found (HTTP %d): %s", agentResp.StatusCode, string(body))
		}

		var agentResult struct {
			Data struct {
				ID        string `json:"id"`
				Name      string `json:"name"`
				Status    string `json:"status"`
				Framework string `json:"framework"`
				Version   string `json:"version"`
			} `json:"data"`
		}
		if err := json.NewDecoder(agentResp.Body).Decode(&agentResult); err != nil {
			return fmt.Errorf("parse agent response: %w", err)
		}

		a := agentResult.Data
		fmt.Printf("Agent: %s (%s)\n", a.Name, a.ID)
		fmt.Printf("Status: %s\n", a.Status)
		fmt.Printf("Framework: %s\n", a.Framework)
		fmt.Printf("Version: %s\n", a.Version)

		// Get versions
		versResp, err := client.Get(apiURL + "/api/v1/agents/" + agentID + "/versions")
		if err != nil {
			return fmt.Errorf("get versions failed: %w", err)
		}
		defer func() { _ = versResp.Body.Close() }()

		if versResp.StatusCode == http.StatusOK {
			var versResult struct {
				Data []struct {
					Version   string `json:"version"`
					CreatedAt string `json:"created_at"`
				} `json:"data"`
			}
			if err := json.NewDecoder(versResp.Body).Decode(&versResult); err == nil && len(versResult.Data) > 0 {
				fmt.Println("\nVersions:")
				for i, v := range versResult.Data {
					marker := ""
					if i == 0 {
						marker = "  (current)"
					}
					fmt.Printf("  %s  %s%s\n", v.Version, v.CreatedAt, marker)
				}
			}
		}

		return nil
	},
}
