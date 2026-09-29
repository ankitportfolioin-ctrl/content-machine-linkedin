# Test Commands Reference

Documented from actual repository package.json scripts. **Do not invent commands.**

## Root Package Scripts (`package.json`)

| Command | Description | Packages |
|---------|-------------|----------|
| `pnpm dev` | Start API and Web in development mode | @growth-operator/api, @growth-operator/web |
| `pnpm worker` | Start worker process | @growth-operator/api |
| `pnpm build` | Build all packages for production | All |
| `pnpm typecheck` | Run TypeScript type checking | All packages |
| `pnpm test` | Run API and Web tests | @growth-operator/api, @growth-operator/web |
| `pnpm test:all` | Run all tests including packages | All packages with tests |
| `pnpm test:watch` | Run API tests in watch mode | @growth-operator/api |
| `pnpm db:generate` | Generate Prisma client | @growth-operator/db |
| `pnpm db:migrate` | Run database migrations | @growth-operator/db |
| `pnpm db:studio` | Open Prisma Studio | @growth-operator/db |
| `pnpm lint` | Run linting | @growth-operator/api, @growth-operator/web |
| `pnpm format` | Format code with Prettier | All |

## Individual Package Commands

### @growth-operator/api (`apps/api/package.json`)

| Command | Description |
|---------|-------------|
| `pnpm --filter=@growth-operator/api dev` | Start API with tsx watch |
| `pnpm --filter=@growth-operator/api worker` | Start worker |
| `pnpm --filter=@growth-operator/api worker:once` | Run worker once |
| `pnpm --filter=@growth-operator/api build` | TypeScript compile |
| `pnpm --filter=@growth-operator/api typecheck` | TypeScript check (no emit) |
| `pnpm --filter=@growth-operator/api test` | Vitest run |
| `pnpm --filter=@growth-operator/api test:watch` | Vitest watch |
| `pnpm --filter=@growth-operator/api lint` | ESLint |
| `pnpm --filter=@growth-operator/api seed:demo` | Seed demo data |

### @growth-operator/web (`apps/web/package.json`)

| Command | Description |
|---------|-------------|
| `pnpm --filter=@growth-operator/web dev` | Vite dev server |
| `pnpm --filter=@growth-operator/web build` | TypeScript + Vite build |
| `pnpm --filter=@growth-operator/web preview` | Vite preview |
| `pnpm --filter=@growth-operator/web typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/web test` | Vitest run |
| `pnpm --filter=@growth-operator/web test:watch` | Vitest watch |
| `pnpm --filter=@growth-operator/web lint` | ESLint |

### @growth-operator/db (`packages/db/package.json`)

| Command | Description |
|---------|-------------|
| `pnpm --filter=@growth-operator/db db:generate` | Prisma generate |
| `pnpm --filter=@growth-operator/db db:migrate` | Prisma migrate deploy |
| `pnpm --filter=@growth-operator/db db:migrate:dev` | Prisma migrate dev |
| `pnpm --filter=@growth-operator/db db:studio` | Prisma studio |
| `pnpm --filter=@growth-operator/db db:push` | Prisma db push |
| `pnpm --filter=@growth-operator/db typecheck` | TypeScript check |

### @growth-operator/ai (`packages/ai/package.json`)

| Command | Description |
|---------|-------------|
| `pnpm --filter=@growth-operator/ai test` | Vitest run |
| `pnpm --filter=@growth-operator/ai typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/ai build` | TypeScript compile |

### @growth-operator/schemas (`packages/schemas/package.json`)

| Command | Description |
|---------|-------------|
| `pnpm --filter=@growth-operator/schemas test` | Vitest run |
| `pnpm --filter=@growth-operator/schemas typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/schemas build` | TypeScript compile |

### @growth-operator/shared (`packages/shared/package.json`)

| Command | Description |
|---------|-------------|
| `pnpm --filter=@growth-operator/shared test` | Vitest run |
| `pnpm --filter=@growth-operator/shared typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/shared build` | TypeScript compile |

### @growth-operator/intelligence (`packages/intelligence/package.json`)

| Command | Description |
|--------|-------------|
| `pnpm --filter=@growth-operator/intelligence test` | Vitest run |
| `pnpm --filter=@growth-operator/intelligence typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/intelligence build` | TypeScript compile |

### @growth-operator/decision (`packages/decision/package.json`)

| Command | Description |
|--------|-------------|
| `pnpm --filter=@growth-operator/decision test` | Vitest run |
| `pnpm --filter=@growth-operator/decision typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/decision build` | TypeScript compile |

### @growth-operator/content (`packages/content/package.json`)

| Command | Description |
|--------|-------------|
| `pnpm --filter=@growth-operator/content test` | Vitest run |
| `pnpm --filter=@growth-operator/content typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/content build` | TypeScript compile |

### @growth-operator/sales (`packages/sales/package.json`)

| Command | Description |
|--------|-------------|
| `pnpm --filter=@growth-operator/sales test` | Vitest run |
| `pnpm --filter=@growth-operator/sales typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/sales build` | TypeScript compile |

### @growth-operator/learning (`packages/learning/package.json`)

| Command | Description |
|--------|-------------|
| `pnpm --filter=@growth-operator/learning test` | Vitest run |
| `pnpm --filter=@growth-operator/learning typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/learning build` | TypeScript compile |

### @growth-operator/business (`packages/business/package.json`)

| Command | Description |
|--------|-------------|
| `pnpm --filter=@growth-operator/business test` | Vitest run |
| `pnpm --filter=@growth-operator/business typecheck` | TypeScript check |
| `pnpm --filter=@growth-operator/business build` | TypeScript compile |

## Test Patterns

### Run Specific Test File
```bash
pnpm --filter=@growth-operator/api test -- apps/api/src/authFlow.test.ts
pnpm --filter=@growth-operator/web test -- apps/web/src/context/AuthContext.test.tsx
```

### Run Tests Matching Pattern
```bash
pnpm --filter=@growth-operator/api test -- --testNamePattern="auth"
pnpm --filter=@growth-operator/api test -- --testNamePattern="onboarding"
```

### Run with Coverage
```bash
pnpm --filter=@growth-operator/api test -- --coverage
```

### Run Integration Tests Only
```bash
# API integration tests (require DB)
pnpm --filter=@growth-operator/api test -- --testNamePattern="integration|e2e"
```

## Database Commands

### Generate Prisma Client
```bash
pnpm db:generate
# or
pnpm --filter=@growth-operator/db db:generate
```

### Run Migrations
```bash
pnpm db:migrate
# or
pnpm --filter=@growth-operator/db db:migrate
```

### Check Migration Status
```bash
pnpm --filter=@growth-operator/db db:migrate status
```

### Validate Schema
```bash
pnpm --filter=@growth-operator/db prisma validate
```

### Open Prisma Studio
```bash
pnpm db:studio
```

## Linting & Formatting

### Lint All
```bash
pnpm lint
```

### Format All
```bash
pnpm format
```

### Typecheck All
```bash
pnpm typecheck
```

## Build All
```bash
pnpm build
```

## Development Workflow

### Start Full Stack (API + Web)
```bash
# Terminal 1: Start PostgreSQL
docker-compose up -d

# Terminal 2: Generate client + migrate
pnpm db:generate && pnpm db:migrate

# Terminal 3: Start API + Web
pnpm dev

# Terminal 4 (optional): Start worker
pnpm worker
```

### Run All Tests
```bash
pnpm test:all
```

### CI Simulation
```bash
pnpm typecheck && pnpm build && pnpm test:all && pnpm db:generate && pnpm db:migrate status
```