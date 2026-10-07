# Repository guidance

- Read `README.md` and `docs/architecture/overview.md` before making structural changes.
- Keep the main application as a modular monolith. The Python AI service is the only separate service at this stage.
- Place web features under `apps/web/src/features/<feature-name>` and shared infrastructure under `apps/web/src/lib`.
- Never commit `.env`, `.env.local`, Supabase secret keys, service-role keys, passwords, or access tokens.
- Every table exposed through Supabase must have explicit grants and row-level security policies in a versioned migration.
- Generate migration files with `pnpm exec supabase migration new <name>`; do not invent migration timestamps.
- Keep `main` deployable. Work in short feature branches and merge through pull requests.
- Run the web lint/build and AI tests before opening a pull request.
