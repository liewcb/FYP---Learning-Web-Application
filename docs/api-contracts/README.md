# API contracts

Document every endpoint before integration. Each contract should include:

- purpose and owning module
- method and path
- authentication requirements
- request body or query parameters
- success response
- error responses
- database status changes

The first planned AI endpoint is `POST /v1/documents/{document_id}/process`. It will be added with the first document-processing feature; the initial scaffold exposes only `GET /health`.
