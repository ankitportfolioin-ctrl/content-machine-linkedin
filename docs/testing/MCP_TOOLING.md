# MCP Tooling Status

Documented from actual `opencode.json` configuration. **Do not claim an MCP is connected unless verified.**

## Configured MCPs (from `opencode.json`)

| Tool | Type | Status | Purpose | Required? |
|------|------|--------|---------|-----------|
| sequential-thinking | Local (npx) | Configured | Structured reasoning for complex problems | Yes |
| memory | Local (npx) | Configured | Persistent knowledge graph across sessions | Yes |
| fetch | Local (npx) | Configured | HTTP fetching for web content | Yes |
| github | Local (npx) | Configured | GitHub API access (issues, PRs, repos) | Yes |
| playwright | Local (npx) | Configured | Browser automation for E2E testing | Yes |
| context7 | Remote (HTTPS) | Configured | Up-to-date library documentation | Yes |
| postgres | Local (npx) | Configured* | PostgreSQL read-only access via Bytebase | Yes |
| stitch | Remote (HTTPS) | Configured | Google Stitch UI generation | No |

*Note: PostgreSQL MCP requires `DATABASE_URL_READONLY` environment variable. Verify it's set in your environment.

## Verification Status

### ✅ Verified Available
- **sequential-thinking**: Used in this session for planning
- **memory**: Used in this session for knowledge graph
- **fetch**: Available for web fetching
- **github**: Available for GitHub operations
- **playwright**: Available - used for browser navigation in this session
- **context7**: Available for library docs

### ⚠️ Needs Verification
- **postgres**: Configured but requires `DATABASE_URL_READONLY` env var. Not yet tested in this session.
- **stitch**: Configured but not used in this session. Optional for this project.

### ❌ Not Configured
- No additional MCPs beyond the 8 listed above

## Environment Variables Required

For full MCP functionality, ensure these are set:

| Variable | Used By | Description |
|----------|---------|-------------|
| `DATABASE_URL_READONLY` | postgres | Read-only PostgreSQL connection string |
| `GITHUB_TOKEN` | github | GitHub personal access token |
| (Context7 API key) | context7 | If required by Context7 service |

## Usage Notes

### Playwright MCP
- Used for: E2E testing, browser navigation, console log capture
- In this session: Successfully navigated to `http://localhost:5173` and `http://localhost:3001/api/v1/health`
- Captures: Page snapshots, console messages, network requests

### PostgreSQL MCP
- Provides: Read-only database access via Bytebase dbhub
- Use for: Schema inspection, query verification, data validation
- **Security**: Read-only by design

### Context7 MCP
- Provides: Up-to-date documentation for libraries/frameworks
- Use for: Checking API syntax, configuration, migration guides
- Preferred over web search for library docs

### GitHub MCP
- Provides: GitHub API access (issues, PRs, repos, files)
- Use for: Creating issues, reading PRs, searching code
- Requires: `GITHUB_TOKEN` with appropriate scopes

### Memory MCP
- Provides: Persistent knowledge graph
- Use for: Storing lessons, decisions, architecture knowledge across sessions
- In this session: Available for use

### Sequential Thinking MCP
- Provides: Structured multi-step reasoning
- Use for: Complex problem decomposition, planning
- In this session: Used for planning this installation

## Missing Tooling

The following are NOT currently available via MCP:
- Direct database write access (postgres is read-only)
- CI/CD pipeline access
- Docker container management
- Cloud provider consoles (AWS, GCP, Azure)
- Monitoring/observability tools (Datadog, Sentry, etc.)

If needed, these must be accessed via CLI or web UI directly.