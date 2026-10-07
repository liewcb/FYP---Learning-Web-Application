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
