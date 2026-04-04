package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/spf13/cobra"
)

var listSearch string
var listJSON bool

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List registered agents",
	RunE: func(_ *cobra.Command, _ []string) error {
		client := &http.Client{Timeout: 5 * time.Second}

		u := apiURL + "/api/v1/agents"
		if listSearch != "" {
			u += "?search=" + url.QueryEscape(listSearch)
		}

		resp, err := client.Get(u)
		if err != nil {
			return fmt.Errorf("API request failed: %w", err)
		}
		defer func() { _ = resp.Body.Close() }()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("read response: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("list failed (HTTP %d): %s", resp.StatusCode, string(body))
		}

		var result struct {
			Data []struct {
				ID        string `json:"id"`
				Name      string `json:"name"`
				Status    string `json:"status"`
				Version   string `json:"version"`
				Framework string `json:"framework"`
			} `json:"data"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return fmt.Errorf("parse response: %w", err)
		}

		if listJSON {
			return PrintJSON(result.Data)
		}

		if len(result.Data) == 0 {
			fmt.Println("No agents found.")
			return nil
		}

		headers := []string{"NAME", "STATUS", "VERSION", "FRAMEWORK", "ID"}
		rows := make([][]string, 0, len(result.Data))
		for _, a := range result.Data {
			rows = append(rows, []string{a.Name, a.Status, a.Version, a.Framework, a.ID})
		}
		PrintTable(headers, rows)

		return nil
	},
}

func init() {
	listCmd.Flags().StringVar(&listSearch, "search", "", "Filter agents by name or description")
	listCmd.Flags().BoolVar(&listJSON, "json", false, "Output as JSON")
}
