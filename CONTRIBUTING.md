# Contributing

## Workflow

1. Pull the latest `main` branch.
2. Create a short-lived branch such as `feature/document-upload` or `fix/login-validation`.
3. Keep each pull request focused on one issue or feature.
4. Run the checks below before pushing.
5. Ask the other teammate to review the pull request before merging.

## Required checks

```powershell
pnpm lint:web
pnpm build:web
python -m pytest services/ai/tests
```

## Commit style

Use short, descriptive messages:

- `feat: add document upload form`
- `fix: enforce document owner policy`
- `test: cover quiz score calculation`
- `docs: explain Supabase setup`
- `chore: update dependencies`

## Database changes

Create migrations through the Supabase CLI:

```powershell
pnpm exec supabase migration new descriptive_name
```

Every exposed table needs explicit grants, row-level security, ownership checks, and indexes for foreign keys and policy columns. Never edit a migration that has already been applied to the shared project; create a new migration instead.
