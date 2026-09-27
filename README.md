# Growth Operator

Human-guided AI operating system for LinkedIn content, relationships, sales intelligence, and growth learning.

## Architecture

```
apps/
  web/          # React + Vite + TypeScript frontend
  api/          # Node.js + Express + TypeScript backend

packages/
  db/           # Prisma database layer
  ai/           # AI provider abstraction
  schemas/      # Shared Zod validation schemas
  shared/       # Shared utilities and types
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- PostgreSQL 17 (via Docker)

### Installation

```bash
# Install dependencies
pnpm install

# Start PostgreSQL
docker-compose up -d

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens (min 32 chars)
- `BCRYPT_ROUNDS` - Password hashing rounds (default: 12)

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start API and Web in development mode |
| `pnpm build` | Build all packages for production |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run all tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm lint` | Run linting |
| `pnpm format` | Format code with Prettier |

### API Endpoints

- `GET /api/v1/health` - Basic health check
- `GET /api/v1/ready` - Readiness check (verifies DB connection)

### Database

The application uses PostgreSQL 17 via Docker. The schema includes:
- User & Workspace management
- Content ideas, drafts, versions
- Leads, conversations, messages
- Pipeline opportunities
- Analytics events
- Learning signals

### Security Principles

- No hard-coded credentials or development bypasses
- Workspace isolation enforced at database and API layer
- Passwords hashed with bcrypt (12 rounds)
- JWT-based authentication
- Structured error responses without stack traces
- No secrets committed to Git

### Human-in-the-Loop

**No consequential LinkedIn action may happen without explicit user approval and backend enforcement.** The system is designed around official/authorized integrations only.