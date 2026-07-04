---
description: Query the Growlancer Supabase database using the supabase-query tool with structured parameters.
---

# Database Query Skill

Use this skill when the user needs to query platform data. Instead of raw SQL, use the `supabase-query` tool which accepts structured parameters.

## How to Use

Call the `supabase-query` tool with:

```json
{
  "table": "profiles",
  "select": "id, full_name, email, created_at",
  "filters": [
    { "column": "role", "operator": "eq", "value": "freelancer" }
  ],
  "orderBy": { "column": "created_at", "ascending": false },
  "limit": 20
}
```

## Available Tables

| Table | Contains |
|-------|----------|
| `profiles` | All users (id, full_name, email, role, avatar_url, created_at) |
| `freelancer_profiles` | Freelancer-specific data (skills, hourly_rate, experience, etc.) |
| `client_projects` | Client-specific data |
| `projects` | All posted projects |
| `proposals` | Freelancer proposals on projects |
| `contracts` | Active/historical contracts |
| `escrow` | Escrow payment records |
| `transactions` | Payment transactions |
| `withdrawals` | Withdrawal requests |
| `wallets` | User wallet balances |
| `notifications` | User notifications |
| `messages` | Chat messages |
| `reviews` | User reviews and ratings |
| `disputes` | Dispute cases |
| `internship_applications` | Internship applications |
| `support_tickets` | Support tickets |

## Filter Operators

- `eq` — Equal to
- `neq` — Not equal to
- `gt` / `gte` — Greater than / Greater than or equal
- `lt` / `lte` — Less than / Less than or equal
- `like` / `ilike` — Pattern match (use `%` as wildcard)
- `is` — IS NULL check (pass `null` as value)
- `in` — Value in array (pass an array)
- `contains` — JSON/array contains

## Safety Notes

- Always add filters to avoid returning too many rows
- Use `limit: 20` unless the user asks for more
- For looking up a single user by ID, use `single: true` with a filter on `id`
