package cli

import (
	"fmt"
	"runtime"

	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the version of recif",
	Run: func(_ *cobra.Command, _ []string) {
		fmt.Printf("recif %s\n", Version)
		fmt.Printf("go %s %s/%s\n", runtime.Version(), runtime.GOOS, runtime.GOARCH)
	},
}
