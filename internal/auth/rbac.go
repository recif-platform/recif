package auth

import "fmt"

// Role constants.
const (
	RoleAdmin         = "admin"
	RolePlatformAdmin = "platform_admin"
	RoleDeveloper     = "developer"
	RoleViewer        = "viewer"
)

// IsAdmin returns true for admin or platform_admin roles.
func IsAdmin(claims *Claims) bool {
	return claims != nil && (claims.Role == RoleAdmin || claims.Role == RolePlatformAdmin)
}

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
	RolePlatformAdmin: {PermAdminAll, PermAgentsRead, PermAgentsWrite, PermAgentsDeploy, PermEvalRun, PermTeamsManage},
	RoleAdmin:         {PermAgentsRead, PermAgentsWrite, PermAgentsDeploy, PermEvalRun, PermTeamsManage},
	RoleDeveloper:     {PermAgentsRead, PermAgentsWrite, PermAgentsDeploy, PermEvalRun},
	RoleViewer:        {PermAgentsRead},
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
