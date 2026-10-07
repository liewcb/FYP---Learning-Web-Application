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

The home page is the smallest complete MVC example. The document repository and
AI health endpoint demonstrate the external-service interface pattern.

## Current student home page

The `/` route currently renders a responsive student dashboard with preview data:

```text
app/page.tsx
  -> HomeController.show()
  -> HomePageModel
  -> HomeView
```

- `models/home/home.model.ts` contains the temporary dashboard data and its types.
- `controllers/home/home.controller.ts` selects the model for the route.
- `views/home/home.view.tsx` renders the student UI.
- `app/globals.css` contains the responsive visual styling.

When authentication is implemented, keep the view unchanged where possible. Replace the preview-model creation inside the controller with repository calls, then map the returned domain objects into the page model.

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
