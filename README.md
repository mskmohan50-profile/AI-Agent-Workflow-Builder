# AI Agent Workflow Builder

A lightweight **n8n-style workflow builder** for chaining AI and automation steps with authentication, role-based permissions, triggers, and approval gates.

### Tech Stack

* **Frontend:** Next.js 14
* **Backend:** Node.js, Express, TypeScript
* **Database:** PostgreSQL
* **Backend Platform:** Nhost + Hasura
* **AI:** Groq API (optional)
* **Auth:** Nhost Auth

## Features

* Visual AI workflow execution
* LLM, HTTP, conditional, database, notification, and approval steps
* Manual, webhook, scheduled, and database-event triggers
* Live workflow execution status
* Organization and role-based access control
* Approval-based pause/resume
* Optional real Groq LLM calls
* Local development with Nhost

## Local Setup

### 1. Start Nhost

```bash
cd nhost
nhost up

hasura migrate apply \
  --database-name default \
  --admin-secret nhost-admin-secret

hasura metadata apply \
  --admin-secret nhost-admin-secret
```

### 2. Start Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Configure `backend/.env`:

```env
HASURA_GRAPHQL_ENDPOINT=http://localhost:1337/v1/graphql
HASURA_GRAPHQL_ADMIN_SECRET=nhost-admin-secret
ACTIONS_SECRET=your-actions-secret
GROQ_API_KEY=your-groq-api-key
PORT=4000
```

> `GROQ_API_KEY` is optional. Without it, LLM steps use a built-in stub response.

### 3. Seed Demo Data

```bash
cd scripts
npx ts-node seed-demo.ts
```

Required variables:

```env
NHOST_AUTH_URL=
HASURA_GRAPHQL_ENDPOINT=
HASURA_GRAPHQL_ADMIN_SECRET=
```

### 4. Start Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Configure:

```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=
NEXT_PUBLIC_NHOST_REGION=
NEXT_PUBLIC_HASURA_GRAPHQL_URL=http://localhost:1337/v1/graphql
```

Open:

**http://localhost:3000**

## Demo Workflow

```text
LLM Call
   ↓
Conditional Branch
   ↓
HTTP Request
   ↓
Approval Gate
   ↓
Database Write
```

The workflow can be started manually or through webhook, scheduled, and database-event triggers.

When an approval gate is reached, the workflow pauses until an authorized user approves it.

## Permissions

The application uses two authorization layers:

1. **Hasura row permissions** — users can only access data belonging to their organization.
2. **Step-level authorization** — sensitive workflow steps and approval actions require appropriate roles.

Use the seeded accounts to test organization isolation and workflow permissions.
