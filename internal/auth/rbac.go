package auth

import "fmt"

// Permission represents an action that can be performed.
type Permission string

const (
	PermAgentsRead   Permission = "agents:read"
	PermAgentsWrite  Permission = "agents:write"
	PermAgentsDeploy Permission = "agents:deploy"
	PermEvalRun      Permission = "eval:run"
	PermTeamsManage  Permission = "teams:manage"
	PermAdminAll     Permission = "admin:all"
)

// rolePermissions maps roles to their allowed permissions.
var rolePermissions = map[string][]Permission{
	"platform_admin": {PermAdminAll, PermAgentsRead, PermAgentsWrite, PermAgentsDeploy, PermEvalRun, PermTeamsManage},
	"admin":          {PermAgentsRead, PermAgentsWrite, PermAgentsDeploy, PermEvalRun, PermTeamsManage},
	"developer":      {PermAgentsRead, PermAgentsWrite, PermAgentsDeploy, PermEvalRun},
	"viewer":         {PermAgentsRead},
}

// HasPermission checks if a role has a specific permission. Deny-by-default.
func HasPermission(role string, perm Permission) bool {
	perms, ok := rolePermissions[role]
	if !ok {
		return false // deny-by-default: unknown role has no permissions
	}
	for _, p := range perms {
		if p == PermAdminAll || p == perm {
			return true
		}
	}
	return false // deny-by-default: permission not found
}

// CheckPermission returns an error if the role lacks the permission.
func CheckPermission(role string, perm Permission) error {
	if !HasPermission(role, perm) {
		return fmt.Errorf("permission denied: role %q lacks %q", role, perm)
	}
	return nil
}
