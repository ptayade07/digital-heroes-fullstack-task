# API Contract

Base URL: the deployed app URL, or `http://localhost:3000` locally.

All authenticated endpoints use an HTTP-only session cookie created by `POST /api/auth/login`.

## Auth

### `POST /api/auth/login`

Request:

```json
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

Response `200`:

```json
{
  "user": {
    "id": "usr_admin",
    "name": "Aarav Admin",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

### `POST /api/auth/logout`

Response `200`:

```json
{ "ok": true }
```

### `GET /api/me`

Returns the signed-in user. Requires authentication.

## Public Lead Capture

### `POST /api/public/leads`

Request:

```json
{
  "name": "Priya Shah",
  "email": "priya@example.com",
  "company": "Bright Cart",
  "message": "We need a Shopify rebuild.",
  "source": "Website"
}
```

Response `201`:

```json
{
  "data": {
    "id": "lead_uuid",
    "status": "new",
    "assignedTo": null
  }
}
```

Validation failures return `422` with a structured error object.

## Leads

### `GET /api/leads`

Query parameters:

- `page`: positive integer, default `1`
- `pageSize`: `1` to `50`, default `10`
- `status`: one of `new`, `contacted`, `qualified`, `proposal`, `won`, `lost`
- `assignedTo`: user id
- `search`: text search across name, email, company, and message

Admin users can see every lead. Member users only see leads assigned to them.

### `GET /api/leads/:id`

Returns one lead if the user has access.

### `PATCH /api/leads/:id`

Request:

```json
{
  "status": "proposal",
  "assignedTo": "usr_member"
}
```

Admin users may update status and assignment. Member users may update status only on assigned leads.

### `POST /api/leads/:id/notes`

Request:

```json
{
  "body": "Called the prospect and confirmed budget range."
}
```

Creates a timestamped note and activity item. Users can only add notes to leads they can access.

## Error Shape

```json
{
  "error": {
    "code": "validation_error",
    "message": "Lead submission is invalid",
    "details": ["email must be valid"]
  }
}
```
