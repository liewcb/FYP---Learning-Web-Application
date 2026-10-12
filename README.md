# AI-Powered Collaborative Learning Platform

A responsive web platform that helps university students manage learning materials, extract important content, generate quizzes, discuss academic topics, share verified resources, form study groups, and collaborate in real time.

This repository is the shared implementation workspace for **Liew Chee Been** and **Shim Kian Hau**.

The current home page is a responsive student dashboard preview. Its sample learning data will be replaced by authenticated Supabase data during the authentication and document-upload milestones.

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
|           |-- app/             # Thin Next.js routes and layouts
|           |-- views/           # React user interface
|           |-- controllers/     # Application use-case orchestration
|           |-- models/          # Domain classes, objects and rules
|           |-- interfaces/      # Supabase and AI service contracts
|           |-- lib/             # Concrete infrastructure implementations
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

Only Node.js and pnpm are required to view the current website. Python is required when developing or testing the AI service, while Docker Desktop is required only for a local Supabase stack.

## Quick start: open the website

1. Open VS Code.
2. Select **File > Open Folder**.
3. Open this folder:

```text
C:\Users\ACER\Documents\fyp ai webplatform\ai-collaborative-learning-platform
```

4. In VS Code, select **Terminal > New Terminal**.
5. Run:

```powershell
pnpm install
pnpm dev:web
```

6. Open <http://localhost:3000> in Chrome, Edge or Firefox.
7. Press `Ctrl+C` in the terminal when you want to stop the website.

The student dashboard uses preview data, so it can be viewed before Supabase authentication is implemented. If port `3000` is busy, Next.js prints the alternative address in the terminal; open that address instead.

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

Copy `services/ai/.env.example` to `services/ai/.env`, then configure the
Supabase secret key, Gemini key and a random `AI_SERVICE_INTERNAL_TOKEN`. These
values are server-only and must never use a `NEXT_PUBLIC_` prefix.

If PowerShell blocks activation, run this once in the current terminal and try again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Running the project

For website-only work, one VS Code terminal is enough:

```powershell
pnpm dev:web
```

Open <http://localhost:3000>.

Use a second terminal only when the website needs the Python AI service:

```powershell
.\.venv\Scripts\Activate.ps1
pnpm dev:ai
```

The AI service runs at <http://localhost:8000>. Its interactive API documentation is at <http://localhost:8000/docs>, and the website-to-AI health proxy is <http://localhost:3000/api/ai/health>.

These processes stay running while you develop. Keep each process in its own terminal and stop it with `Ctrl+C`.

## Where to write code

| Work | Location |
|---|---|
| Next.js routes and API entry points | `apps/web/src/app` |
| React user interface | `apps/web/src/views` |
| Page and use-case coordination | `apps/web/src/controllers` |
| Classes, objects and business rules | `apps/web/src/models` |
| Supabase and AI contracts | `apps/web/src/interfaces` |
| Supabase/HTTP implementations | `apps/web/src/lib` |
| Python AI and document processing | `services/ai` |

Normal authentication, forum, profile, group and document-record logic stays in the web application and Supabase. The Python service is reserved for extraction, preprocessing and AI workloads.

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
| `pnpm install` | Install all locked JavaScript dependencies |
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

## MVC development guide

The Next.js application uses MVC with a separate interface/adaptor boundary:

- **Model:** classes, data objects, types, validation and pure business rules in `apps/web/src/models`.
- **View:** React UI in `apps/web/src/views`.
- **Controller:** coordinates use cases in `apps/web/src/controllers`.
- **Interface:** describes required Supabase repositories or external services in `apps/web/src/interfaces`.
- **Implementation:** talks to Supabase or FastAPI from `apps/web/src/lib`.
- **App Router:** `apps/web/src/app` contains only route entry points, layouts and API endpoints.

Read [`apps/web/src/README.md`](apps/web/src/README.md) before adding a new module. The home page is a working MVC example, while the document repository and AI health route demonstrate how external calls cross an interface.

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
- [x] MVC web structure and infrastructure interfaces
- [x] Responsive student home dashboard with preview data
- [x] FastAPI health service
- [x] Supabase local configuration
- [x] Secure starter migration prepared
- [x] Automated web and Python checks
- [x] Starter and AI-learning migrations applied to the shared Supabase project
- [ ] Authentication flow
- [ ] Document upload flow
- [x] Content-analysis and Gemini quiz service endpoints
- [x] Protected Supabase persistence adapters for analyses and quizzes
- [ ] Next.js document-to-AI integration and student UI
