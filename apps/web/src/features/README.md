# Web features

Create one folder per product feature. Keep feature-specific components, server actions, validation and tests together.

Planned folders:

```text
auth/
profiles/
documents/
analysis/
quizzes/
forum/
library/
peers/
study-groups/
video/
admin/
monitoring/
```

Shared Supabase clients and generic helpers belong under `src/lib`, not inside a feature.
