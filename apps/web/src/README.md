# Web source structure

This application uses MVC inside the Next.js App Router.

```text
src/
|-- app/          # Next.js routes, layouts and API entry points
|-- views/        # React UI only
|-- controllers/  # Use-case orchestration between views and models
|-- models/       # Domain classes, data objects, types and pure rules
|-- interfaces/   # Contracts for databases and external services
|-- lib/          # Concrete Supabase, HTTP and framework implementations
`-- types/        # Generated/shared framework types
```

Dependency direction:

```text
app -> controller -> interface <- lib implementation
          |                         |
          v                         v
        model                 Supabase / AI service

app -> view -> model
```

Rules:

- Views render data and collect input. They do not call Supabase or FastAPI.
- Controllers implement application use cases and depend on interfaces.
- Models contain domain data and rules without React, Next.js or Supabase code.
- Interfaces describe what the application needs from external systems.
- `lib` implements those interfaces using Supabase, HTTP and Next.js utilities.
- `app` files remain thin framework entry points that assemble controllers and views.

The document repository and AI health endpoint demonstrate the external-service
interface pattern.

## Student dashboard (revision workspace)

The `/` route is the revision workspace: sources, a reader and a notebook.

```text
app/page.tsx
  -> RevisionController.loadDashboard()   (documents, subjects, notes, progress)
  -> RevisionDashboardModel
  -> RevisionDashboardView -> RevisionWorkspace (client)
       -> app/revision/actions.ts (Server Actions) -> RevisionController
```

- `models/revision/revision.model.ts` holds the types and pure rules: passages,
  streak, validation.
- `interfaces/repositories/revision.repository.ts` is implemented by
  `lib/supabase/repositories/supabase-revision.repository.ts`.
- `views/revision/` contains the Sources, Reader and Notebook panes.
- `models/home/home.model.ts` now only holds the student navigation.

## Adding a module

For a new quiz module, create only the layers it needs:

```text
models/quiz/
views/quiz/
controllers/quiz/
interfaces/repositories/quiz.repository.ts
lib/supabase/repositories/supabase-quiz.repository.ts
```

An interface is an application contract. For example, `DocumentRepository` says what document persistence must do, while `SupabaseDocumentRepository` contains the actual Supabase queries. Controllers import the contract, not the concrete adapter.
