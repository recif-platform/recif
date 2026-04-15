package user

import "time"

// User is the public representation of a platform user.
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// UpdateProfileRequest is the payload for updating the current user's profile.
type UpdateProfileRequest struct {
	Name string `json:"name"`
}

// ChangePasswordRequest is the payload for changing the current user's password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}
