package auth

import "testing"

func TestHasPermission(t *testing.T) {
	cases := []struct {
		role string
		perm Permission
		want bool
	}{
		{RolePlatformAdmin, PermAgentsRead, true},
		{RolePlatformAdmin, PermAdminAll, true},
		{RoleAdmin, PermAgentsRead, true},
		{RoleAdmin, PermTeamsManage, true},
		{RoleDeveloper, PermAgentsRead, true},
		{RoleDeveloper, PermTeamsManage, false},
		{RoleViewer, PermAgentsRead, true},
		{RoleViewer, PermAgentsWrite, false},
		{RoleViewer, PermEvalRun, false},
		{"unknown_role", PermAgentsRead, false},
		{"", PermAgentsRead, false},
	}
	for _, tc := range cases {
		t.Run(tc.role+"/"+string(tc.perm), func(t *testing.T) {
			if got := HasPermission(tc.role, tc.perm); got != tc.want {
				t.Errorf("HasPermission(%q, %q) = %v, want %v", tc.role, tc.perm, got, tc.want)
			}
		})
	}
}

func TestCheckPermission(t *testing.T) {
	if err := CheckPermission(RoleAdmin, PermAgentsRead); err != nil {
		t.Errorf("expected nil, got %v", err)
	}
	if err := CheckPermission(RoleViewer, PermAgentsWrite); err == nil {
		t.Error("expected error for viewer writing agents")
	}
}
