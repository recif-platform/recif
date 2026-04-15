package user

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	db "github.com/sciences44/recif/internal/db/generated"
)

// ErrNotFound is returned when a user is not found.
var ErrNotFound = errors.New("user not found")

// ErrEmailTaken is returned when the email is already registered.
var ErrEmailTaken = errors.New("email already in use")

// Repository provides user persistence.
type Repository struct {
	q *db.Queries
}

// NewRepository creates a new user Repository.
func NewRepository(q *db.Queries) *Repository {
	return &Repository{q: q}
}

func (r *Repository) GetByID(ctx context.Context, id string) (*User, error) {
	row, err := r.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user %s: %w", id, err)
	}
	return rowToUser(row), nil
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*User, error) {
	row, err := r.q.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return rowToUser(row), nil
}

// GetHashByEmail returns the stored bcrypt hash for the given email.
func (r *Repository) GetHashByEmail(ctx context.Context, email string) (id, hash string, err error) {
	row, err := r.q.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", ErrNotFound
		}
		return "", "", fmt.Errorf("get user by email: %w", err)
	}
	return row.ID, row.PasswordHash, nil
}

func (r *Repository) Create(ctx context.Context, id, email, name, role, plainPassword string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plainPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	row, err := r.q.CreateUser(ctx, db.CreateUserParams{
		ID:           id,
		Email:        email,
		Name:         name,
		Role:         role,
		PasswordHash: string(hash),
	})
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return rowToUser(row), nil
}

func (r *Repository) UpdateProfile(ctx context.Context, id, name, email string) (*User, error) {
	row, err := r.q.UpdateUser(ctx, db.UpdateUserParams{
		ID:    id,
		Name:  name,
		Email: email,
	})
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return rowToUser(row), nil
}

func (r *Repository) UpdatePassword(ctx context.Context, id, plainPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(plainPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	return r.q.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
		ID:           id,
		PasswordHash: string(hash),
	})
}

// List returns all users ordered by creation date.
func (r *Repository) List(ctx context.Context) ([]*User, error) {
	rows, err := r.q.ListUsers(ctx)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	users := make([]*User, len(rows))
	for i, row := range rows {
		users[i] = rowToUser(row)
	}
	return users, nil
}

// Count returns the total number of users in the database.
func (r *Repository) Count(ctx context.Context) (int64, error) {
	return r.q.CountUsers(ctx)
}

func rowToUser(row db.User) *User {
	return &User{
		ID:        row.ID,
		Email:     row.Email,
		Name:      row.Name,
		Role:      row.Role,
		CreatedAt: row.CreatedAt.Time,
	}
}
