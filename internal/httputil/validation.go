package httputil

import (
	"strings"

	"github.com/go-playground/validator/v10"
)

// FormatValidationErrors formats validator.ValidationErrors into a readable string.
func FormatValidationErrors(err error) string {
	var msgs []string
	if ve, ok := err.(validator.ValidationErrors); ok { //nolint:errorlint // validator returns concrete type
		for _, fe := range ve {
			msgs = append(msgs, fe.Field()+": "+fe.Tag())
		}
	}
	return strings.Join(msgs, "; ")
}
