# AI Test Generator

## Environment
Set `GEMINI_API_KEY` in the backend runtime environment. Never expose it through a `VITE_*` variable or commit it to Git.

## Endpoint
`POST /api/ai-tests/generate` (teacher role required), multipart form-data:
- `subject`: string
- `topic`: string
- `questionCount`: integer 1–30
- `difficulty`: `EASY`, `MEDIUM`, or `HARD`
- `materialText`: optional text
- `file`: optional PDF or DOCX, max 8 MB

The endpoint returns draft questions for teacher review. It does not persist tests or expose them to students. Add request-level AI usage limits before opening access broadly, and configure your Gemini account/billing as appropriate.
