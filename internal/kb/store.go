package kb

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
)

// ErrNotFound is returned when a knowledge base or document is not found.
var ErrNotFound = errors.New("not found")

// Store provides data access to the corail_storage database for knowledge base operations.
type Store struct {
	pool *pgxpool.Pool
	dsn  string
}

// NewStore creates a new Store backed by the given connection pool.
func NewStore(pool *pgxpool.Pool, dsn string) *Store {
	return &Store{pool: pool, dsn: dsn}
}

// DSN returns the database connection string.
func (s *Store) DSN() string { return s.dsn }

// List returns all knowledge bases with their document and chunk counts.
func (s *Store) List(ctx context.Context) ([]KnowledgeBase, error) {
	const query = `
		SELECT
			kb.id, kb.team_id, kb.name, kb.slug, kb.description,
			kb.embedding_model, kb.embedding_dim, kb.chunk_size, kb.chunk_overlap,
			kb.created_at, kb.updated_at,
			COALESCE(doc_stats.doc_count, 0) AS doc_count,
			COALESCE(doc_stats.chunk_count, 0) AS chunk_count
		FROM knowledge_bases kb
		LEFT JOIN (
			SELECT kb_id,
				COUNT(*) AS doc_count,
				COALESCE(SUM(chunk_count), 0) AS chunk_count
			FROM kb_documents
			GROUP BY kb_id
		) doc_stats ON doc_stats.kb_id = kb.id
		ORDER BY kb.created_at DESC
	`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list knowledge bases: %w", err)
	}
	defer rows.Close()

	var results []KnowledgeBase
	for rows.Next() {
		var kb KnowledgeBase
		if err := rows.Scan(
			&kb.ID, &kb.TeamID, &kb.Name, &kb.Slug, &kb.Description,
			&kb.EmbeddingModel, &kb.EmbeddingDim, &kb.ChunkSize, &kb.ChunkOverlap,
			&kb.CreatedAt, &kb.UpdatedAt,
			&kb.DocCount, &kb.ChunkCount,
		); err != nil {
			return nil, fmt.Errorf("scan knowledge base: %w", err)
		}
		kb.Status = deriveStatus(kb.DocCount, kb.ChunkCount)
		results = append(results, kb)
	}

	return results, rows.Err()
}

// Get returns a single knowledge base by ID with its statistics.
func (s *Store) Get(ctx context.Context, id string) (*KnowledgeBase, error) {
	const query = `
		SELECT
			kb.id, kb.team_id, kb.name, kb.slug, kb.description,
			kb.embedding_model, kb.embedding_dim, kb.chunk_size, kb.chunk_overlap,
			kb.created_at, kb.updated_at,
			COALESCE(doc_stats.doc_count, 0) AS doc_count,
			COALESCE(doc_stats.chunk_count, 0) AS chunk_count
		FROM knowledge_bases kb
		LEFT JOIN (
			SELECT kb_id,
				COUNT(*) AS doc_count,
				COALESCE(SUM(chunk_count), 0) AS chunk_count
			FROM kb_documents
			GROUP BY kb_id
		) doc_stats ON doc_stats.kb_id = kb.id
		WHERE kb.id = $1
	`

	var kb KnowledgeBase
	err := s.pool.QueryRow(ctx, query, id).Scan(
		&kb.ID, &kb.TeamID, &kb.Name, &kb.Slug, &kb.Description,
		&kb.EmbeddingModel, &kb.EmbeddingDim, &kb.ChunkSize, &kb.ChunkOverlap,
		&kb.CreatedAt, &kb.UpdatedAt,
		&kb.DocCount, &kb.ChunkCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get knowledge base %s: %w", id, err)
	}

	kb.Status = deriveStatus(kb.DocCount, kb.ChunkCount)
	return &kb, nil
}

// Create inserts a new knowledge base and returns it.
// teamID is extracted from the request context by the handler.
func (s *Store) Create(ctx context.Context, params CreateParams, teamID string) (*KnowledgeBase, error) {
	id := "kb_" + ulid.Make().String()
	slug := slugify(params.Name)
	now := time.Now().UTC()

	embeddingModel := params.EmbeddingModel
	if embeddingModel == "" {
		embeddingModel = "nomic-embed-text"
	}
	chunkSize := params.ChunkSize
	if chunkSize == 0 {
		chunkSize = 512
	}
	chunkOverlap := params.ChunkOverlap
	if chunkOverlap == 0 {
		chunkOverlap = 50
	}

	const query = `
		INSERT INTO knowledge_bases (id, team_id, name, slug, description, embedding_model, embedding_dim, chunk_size, chunk_overlap, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 768, $7, $8, $9, $9)
		RETURNING id, team_id, name, slug, description, embedding_model, embedding_dim, chunk_size, chunk_overlap, created_at, updated_at
	`

	var kb KnowledgeBase
	err := s.pool.QueryRow(ctx, query,
		id, teamID, params.Name, slug, params.Description,
		embeddingModel, chunkSize, chunkOverlap, now,
	).Scan(
		&kb.ID, &kb.TeamID, &kb.Name, &kb.Slug, &kb.Description,
		&kb.EmbeddingModel, &kb.EmbeddingDim, &kb.ChunkSize, &kb.ChunkOverlap,
		&kb.CreatedAt, &kb.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create knowledge base: %w", err)
	}

	kb.Status = "empty"
	return &kb, nil
}

// ListDocuments returns all documents for a given knowledge base.
func (s *Store) ListDocuments(ctx context.Context, kbID string) ([]Document, error) {
	const query = `
		SELECT id, kb_id, filename, content_type, status, COALESCE(page_count, 0), COALESCE(chunk_count, 0), COALESCE(error, ''), created_at
		FROM kb_documents
		WHERE kb_id = $1
		ORDER BY created_at DESC
	`

	rows, err := s.pool.Query(ctx, query, kbID)
	if err != nil {
		return nil, fmt.Errorf("list documents for kb %s: %w", kbID, err)
	}
	defer rows.Close()

	var docs []Document
	for rows.Next() {
		var d Document
		if err := rows.Scan(
			&d.ID, &d.KBID, &d.Filename, &d.ContentType,
			&d.Status, &d.PageCount, &d.ChunkCount, &d.Error, &d.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		docs = append(docs, d)
	}

	return docs, rows.Err()
}

// Delete removes a knowledge base. Documents and chunks are removed via the
// ON DELETE CASCADE foreign keys declared in the schema.
func (s *Store) Delete(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM knowledge_bases WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete knowledge base %s: %w", id, err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteDocument removes a document and returns its filename so the caller
// can clean up the corresponding upload on disk. Returns ErrNotFound when
// no row matches the (kbID, docID) pair.
func (s *Store) DeleteDocument(ctx context.Context, kbID, docID string) (string, error) {
	var filename string
	err := s.pool.QueryRow(ctx,
		`DELETE FROM kb_documents WHERE id = $1 AND kb_id = $2 RETURNING filename`,
		docID, kbID,
	).Scan(&filename)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("delete document %s: %w", docID, err)
	}
	return filename, nil
}

// CreateDocument inserts a new document record with the given status.
func (s *Store) CreateDocument(ctx context.Context, kbID, filename, contentType string) (*Document, error) {
	id := "doc_" + ulid.Make().String()
	now := time.Now().UTC()

	const query = `
		INSERT INTO kb_documents (id, kb_id, filename, content_type, status, created_at)
		VALUES ($1, $2, $3, $4, 'pending', $5)
		RETURNING id, kb_id, filename, content_type, status, COALESCE(page_count, 0), COALESCE(chunk_count, 0), COALESCE(error, ''), created_at
	`

	var d Document
	err := s.pool.QueryRow(ctx, query, id, kbID, filename, contentType, now).Scan(
		&d.ID, &d.KBID, &d.Filename, &d.ContentType,
		&d.Status, &d.PageCount, &d.ChunkCount, &d.Error, &d.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}

	return &d, nil
}

// SearchChunks performs a pgvector similarity search using a pre-computed embedding.
func (s *Store) SearchChunks(ctx context.Context, kbID string, embedding []float32, topK int) ([]SearchResult, error) {
	const query = `
		SELECT
			c.id, c.content, c.chunk_index, c.document_id,
			d.filename,
			1 - (c.embedding <=> $1::vector) AS score
		FROM chunks c
		JOIN kb_documents d ON d.id = c.document_id
		WHERE c.kb_id = $2
		ORDER BY c.embedding <=> $1::vector
		LIMIT $3
	`

	// Format embedding as pgvector literal: [0.1,0.2,...]
	vecLiteral := formatVector(embedding)

	rows, err := s.pool.Query(ctx, query, vecLiteral, kbID, topK)
	if err != nil {
		return nil, fmt.Errorf("search chunks in kb %s: %w", kbID, err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.ChunkID, &r.Content, &r.ChunkIndex, &r.DocumentID, &r.Filename, &r.Score); err != nil {
			return nil, fmt.Errorf("scan search result: %w", err)
		}
		results = append(results, r)
	}

	return results, rows.Err()
}

// HybridSearch combines pgvector cosine similarity and BM25 full-text search
// using Reciprocal Rank Fusion (RRF) with k=60.
func (s *Store) HybridSearch(ctx context.Context, kbID string, embedding []float32, queryText string, topK int) ([]SearchResult, error) {
	fetchK := topK * 2

	semanticResults, err := s.semanticSearch(ctx, kbID, embedding, fetchK)
	if err != nil {
		return nil, fmt.Errorf("hybrid search semantic: %w", err)
	}

	bm25Results, err := s.bm25Search(ctx, kbID, queryText, fetchK)
	if err != nil {
		return nil, fmt.Errorf("hybrid search bm25: %w", err)
	}

	return rrfMerge(semanticResults, bm25Results, topK), nil
}

// semanticSearch performs pure vector cosine similarity search.
func (s *Store) semanticSearch(ctx context.Context, kbID string, embedding []float32, topK int) ([]SearchResult, error) {
	const query = `
		SELECT
			c.id, c.content, c.chunk_index, c.document_id,
			d.filename,
			1 - (c.embedding <=> $1::vector) AS score
		FROM chunks c
		JOIN kb_documents d ON d.id = c.document_id
		WHERE c.kb_id = $2
		ORDER BY c.embedding <=> $1::vector
		LIMIT $3
	`

	vecLiteral := formatVector(embedding)
	rows, err := s.pool.Query(ctx, query, vecLiteral, kbID, topK)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.ChunkID, &r.Content, &r.ChunkIndex, &r.DocumentID, &r.Filename, &r.Score); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

// bm25Search performs BM25 full-text search using the tsvector column.
func (s *Store) bm25Search(ctx context.Context, kbID, queryText string, topK int) ([]SearchResult, error) {
	const query = `
		SELECT
			c.id, c.content, c.chunk_index, c.document_id,
			d.filename,
			ts_rank_cd(c.tsv, plainto_tsquery('english', $1)) AS score
		FROM chunks c
		JOIN kb_documents d ON d.id = c.document_id
		WHERE c.kb_id = $2 AND c.tsv @@ plainto_tsquery('english', $1)
		ORDER BY score DESC
		LIMIT $3
	`

	rows, err := s.pool.Query(ctx, query, queryText, kbID, topK)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.ChunkID, &r.Content, &r.ChunkIndex, &r.DocumentID, &r.Filename, &r.Score); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

const rrfK = 60

// rrfMerge merges two ranked result lists using Reciprocal Rank Fusion.
func rrfMerge(semantic, bm25 []SearchResult, topK int) []SearchResult {
	type scored struct {
		result SearchResult
		score  float64
	}

	scores := make(map[string]float64)
	byID := make(map[string]SearchResult)

	for rank, r := range semantic {
		scores[r.ChunkID] += 1.0 / float64(rrfK+rank+1)
		byID[r.ChunkID] = r
	}
	for rank, r := range bm25 {
		scores[r.ChunkID] += 1.0 / float64(rrfK+rank+1)
		if _, exists := byID[r.ChunkID]; !exists {
			byID[r.ChunkID] = r
		}
	}

	// Collect and sort by RRF score descending
	items := make([]scored, 0, len(scores))
	for id, s := range scores {
		items = append(items, scored{result: byID[id], score: s})
	}

	// Sort descending by score
	sort.Slice(items, func(i, j int) bool {
		return items[i].score > items[j].score
	})

	if len(items) > topK {
		items = items[:topK]
	}

	results := make([]SearchResult, len(items))
	for i, item := range items {
		results[i] = item.result
		results[i].Score = item.score
	}
	return results
}

// Document statuses used by the ingestion pipeline. The DB column is plain
// text so these constants are the single source of truth.
const (
	DocStatusPending    = "pending"
	DocStatusProcessing = "processing"
	DocStatusReady      = "ready"
	DocStatusError      = "error"
)

// MarkDocumentsError flips every pending/processing document in a KB to the
// error status and records the failure message on each row.
func (s *Store) MarkDocumentsError(ctx context.Context, kbID, errMsg string) error {
	return s.transitionDocumentStatus(ctx, kbID, DocStatusError, errMsg,
		DocStatusPending, DocStatusProcessing)
}

// MarkDocumentsProcessing flips every pending document in a KB to the
// processing status so the dashboard shows a spinner immediately.
func (s *Store) MarkDocumentsProcessing(ctx context.Context, kbID string) error {
	return s.transitionDocumentStatus(ctx, kbID, DocStatusProcessing, "",
		DocStatusPending)
}

// transitionDocumentStatus updates every document in a KB whose current
// status is in fromStatuses to toStatus. If errMsg is non-empty, the error
// column is also set (used by the error transition).
func (s *Store) transitionDocumentStatus(
	ctx context.Context, kbID, toStatus, errMsg string, fromStatuses ...string,
) error {
	const query = `
		UPDATE kb_documents
		SET status = $1,
		    error = CASE WHEN $2 = '' THEN error ELSE $2 END
		WHERE kb_id = $3 AND status = ANY($4)
	`
	_, err := s.pool.Exec(ctx, query, toStatus, errMsg, kbID, fromStatuses)
	return err
}

// deriveStatus computes a human-readable status from document/chunk counts.
func deriveStatus(docCount, chunkCount int) string {
	if docCount == 0 {
		return "empty"
	}
	if chunkCount == 0 {
		return "processing"
	}
	return "ready"
}

// formatVector converts a float32 slice to a pgvector string literal.
func formatVector(v []float32) string {
	buf := make([]byte, 0, len(v)*12)
	buf = append(buf, '[')
	for i, f := range v {
		if i > 0 {
			buf = append(buf, ',')
		}
		buf = append(buf, []byte(fmt.Sprintf("%g", f))...)
	}
	buf = append(buf, ']')
	return string(buf)
}

// slugify converts a name to a URL-safe slug.
func slugify(name string) string {
	s := make([]byte, 0, len(name))
	for _, c := range []byte(name) {
		switch {
		case c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-':
			s = append(s, c)
		case c >= 'A' && c <= 'Z':
			s = append(s, c+32) // lowercase
		case c == ' ':
			s = append(s, '-')
		}
	}
	return string(s)
}
