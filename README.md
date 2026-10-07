# AI-Powered Collaborative Learning Platform

A responsive web platform that helps university students manage learning materials, extract important content, generate quizzes, discuss academic topics, share verified resources, form study groups, and collaborate in real time.

This repository is the shared implementation workspace for **Liew Chee Been** and **Shim Kian Hau**.

## Project links

- GitHub: <https://github.com/liewcb/FYP---Learning-Web-Application>
- Supabase project: <https://eqoxfvrdsysptrdzruoe.supabase.co>
- Supabase project reference: `eqoxfvrdsysptrdzruoe`

## Architecture

The system uses a three-tier, client-server architecture:

```text
Next.js responsive website
        |
        +-- Supabase Auth, PostgreSQL, Storage and Realtime
        |
        +-- FastAPI AI service for extraction, analysis and quiz generation
        |
        +-- Jitsi integration for video meetings (later milestone)
```

The main web application is a modular monolith. The AI/document-processing service is separated because its Python libraries and workloads differ from the web application.

See [`docs/architecture/overview.md`](docs/architecture/overview.md) for module boundaries and the main document-processing flow.

## Repository structure

```text
ai-collaborative-learning-platform/
|-- apps/
|   `-- web/                     # Next.js website
|       `-- src/
|           |-- app/             # Routes and layouts
|           |-- features/        # Product modules
|           |-- lib/             # Supabase and shared infrastructure
|           `-- types/           # Shared TypeScript types
|-- services/
|   `-- ai/                      # FastAPI AI/document service
|       |-- app/
|       `-- tests/
|-- supabase/
|   |-- migrations/              # Versioned database changes
|   `-- config.toml              # Local Supabase configuration
|-- docs/
|   |-- architecture/
|   |-- api-contracts/
|   |-- decisions/
|   `-- test-cases/
`-- .github/workflows/           # Automated checks
```

## Prerequisites

Install these tools before starting:

- Git
- Node.js 22 or newer
- pnpm 11
- Python 3.12
- VS Code
- Docker Desktop only if you want to run Supabase locally

Verify them:

```powershell
git --version
node --version
pnpm --version
python --version
```

## First-time setup

### 1. Clone the repository

```powershell
git clone https://github.com/liewcb/FYP---Learning-Web-Application.git
cd FYP---Learning-Web-Application
```

### 2. Install web dependencies

```powershell
pnpm install
```

### 3. Configure the website environment

```powershell
Copy-Item apps/web/.env.local.example apps/web/.env.local
```

Open `apps/web/.env.local` and replace the publishable-key placeholder with the value from the Supabase project's **Connect** dialog. The publishable key may be used by the browser; never place a secret key in a `NEXT_PUBLIC_` variable.

### 4. Configure the Python service

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r services/ai/requirements-dev.txt
```

If PowerShell blocks activation, run this once in the current terminal and try again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Running the project

Use two VS Code terminals.

Terminal 1 - website:

```powershell
pnpm dev:web
```

Open <http://localhost:3000>.

Terminal 2 - AI service:

```powershell
.\.venv\Scripts\Activate.ps1
pnpm dev:ai
```

Open <http://localhost:8000/health> or the generated API documentation at <http://localhost:8000/docs>.

## Supabase workflow

The repository contains a local Supabase configuration and a reviewed starter migration. The initial migration creates secure profile and private-document foundations; it has not been applied merely by cloning the repository.

Authenticate and link the local repository:

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref eqoxfvrdsysptrdzruoe
```

Review pending migrations before applying them:

```powershell
pnpm exec supabase migration list
pnpm exec supabase db push
```

For local Supabase development, start Docker Desktop and run:

```powershell
pnpm supabase:start
pnpm supabase:reset
```

Security rules:

- All public-schema tables must use row-level security.
- Browser code uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Secret keys belong only in server-side environment files and must never be committed.
- User roles must not be read from user-editable metadata.
- User files stay in a private storage bucket and are restricted by owner policies.

## Development commands

| Command | Purpose |
|---|---|
| `pnpm dev:web` | Start the Next.js development server |
| `pnpm lint:web` | Run the web linter |
| `pnpm build:web` | Produce a production web build |
| `pnpm dev:ai` | Start the FastAPI service |
| `pnpm test:ai` | Run Python tests |
| `pnpm supabase:start` | Start local Supabase with Docker |
| `pnpm supabase:reset` | Rebuild the local database from migrations |

## Team ownership

| Shim Kian Hau | Liew Chee Been |
|---|---|
| User management | Content analysis |
| Document upload and management | Quiz and assessment generation |
| Text extraction and preprocessing | Forum |
| Peer connections | Learning material library |
| Study groups and chat | Administration |
| Video conference integration | System monitoring |

Both developers jointly own database migrations, integration, testing, deployment, and documentation.

## GitHub workflow

1. Keep `main` deployable.
2. Create a GitHub Issue for each feature or defect.
3. Create a branch such as `feature/user-registration`.
4. Commit small, reviewable changes.
5. Push the branch and open a pull request.
6. The other teammate reviews it before merge.
7. Do not commit directly to `main` after the initial scaffold.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for checks and commit conventions.

## Initial development order

1. Registration, login and profile management
2. Private PDF/DOCX upload
3. Text extraction and preprocessing
4. Content analysis and summary display
5. Quiz generation, attempts and scores
6. Forum and moderated material library
7. Peer connections, groups and real-time chat
8. Video meeting integration
9. Admin moderation and monitoring dashboard

Build the first five items as one complete end-to-end flow before expanding the remaining modules.

## Current status

- [x] Repository scaffold
- [x] Next.js web shell
- [x] FastAPI health service
- [x] Supabase local configuration
- [x] Secure starter migration prepared
- [x] Automated web and Python checks
- [ ] Starter migration applied to the shared Supabase project
- [ ] Authentication flow
- [ ] Document upload flow
- [ ] AI processing flow
