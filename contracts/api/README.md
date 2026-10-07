# REST contract used by the existing Angular app (`engro PPE`).

Base: `{apiBaseUrl}/api/v1`

Auth
- POST /auth/register — raw AuthResponse (first Super Admin only)
- POST /auth/login — envelope
- POST /auth/refresh — envelope
- GET /auth/me — envelope
- POST /auth/hub-connection-token — envelope `{ accessToken }`

PPE (`/ppe/...`) responses are `ApiEnvelope<T>` with optional `meta` pagination.

Shocking boundary PUT `/ppe/cameras/{code}/zones` stores `yellowZone` / `redZone`.
Empty polygons mean everyone is OUTSIDE (helmet + goggles only).
