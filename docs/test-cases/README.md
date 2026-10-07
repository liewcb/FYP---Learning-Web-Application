# Test cases

Add formal Project II test cases here using this naming convention:

```text
TC-<module>-<number>
```

Example: `TC-DOC-001 - authenticated user uploads a valid PDF`.

Each test case should record prerequisites, input data, steps, expected result, actual result, pass/fail status, tester, date and evidence.

## Automated checks currently available

| Area | Command | Current coverage |
|---|---|---|
| Web style and correctness | `pnpm lint:web` | Next.js and TypeScript source linting |
| Web compilation | `pnpm build:web` | Production compilation, routes and type checking |
| AI service | `pnpm test:ai` | FastAPI health endpoint |

Automated checks support the formal test cases but do not replace user-acceptance evidence. Add unit and integration tests beside each feature as it is implemented.
