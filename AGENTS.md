# Repository guidance

- Read `README.md` and `docs/architecture/overview.md` before making structural changes.
- Keep the main application as a modular monolith. The Python AI service is the only separate service at this stage.
- Follow the MVC boundaries in `apps/web/src`: UI in `views`, domain code in `models`, orchestration in `controllers`, external contracts in `interfaces`, and concrete infrastructure in `lib`.
- Keep Next.js `app` files thin. Views and controllers must not call Supabase or the Python service directly; use an interface with an implementation under `lib`.
- Never commit `.env`, `.env.local`, Supabase secret keys, service-role keys, passwords, or access tokens.
- Every table exposed through Supabase must have explicit grants and row-level security policies in a versioned migration.
- Generate migration files with `pnpm exec supabase migration new <name>`; do not invent migration timestamps.
- Keep `main` deployable. Work in short feature branches and merge through pull requests.
- Run the web lint/build and AI tests before opening a pull request.
