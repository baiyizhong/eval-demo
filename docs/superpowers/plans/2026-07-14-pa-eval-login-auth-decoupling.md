# PA Eval Login Auth Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple login/authentication from business modules by introducing a `pa-eval-login` frontend module and backend auth provider boundary with enterprise API password authentication.

**Architecture:** Business modules continue to consume only `/api/user/session`, `useSessionStore`, `usePermission`, and route guards. Login methods live behind frontend `pa-eval-login` helpers and backend auth provider functions that produce a common PA access cookie.

**Tech Stack:** React 19, Vite 8, TypeScript, FastAPI, httpx, Pydantic Settings, pytest, node:test source checks.

## Global Constraints

- Always respond in Chinese-simplified.
- Do not modify `langfuse/` or `dify/`.
- Do not commit, push, or create PR unless explicitly requested.
- Do not hardcode enterprise API URLs, secrets, or credentials; use `.env` / environment variables.
- Keep API responses in `{ code, message, data, txId }` format.
- Do not modify Langfuse native tables.

---

### Task 1: Backend Auth Provider Boundary

**Files:**
- Create: `pa-eval-backend/app/auth_providers.py`
- Modify: `pa-eval-backend/app/auth.py`
- Modify: `pa-eval-backend/app/errors.py`
- Modify: `pa-eval-backend/app/config.py`
- Test: `pa-eval-backend/tests/test_auth.py`

**Interfaces:**
- Produces: `AuthenticatedIdentity(provider, external_id, email, name, login)`.
- Produces: `create_pa_access_token(identity, langfuse_user, settings) -> str`.
- Produces: `authenticate_enterprise_password(username, password, settings, client) -> AuthenticatedIdentity`.
- Consumes: `LangfuseDatabaseReader.get_user_by_email(email)`.

- [x] Write failing backend tests for enterprise auth options, missing config, successful enterprise API login, invalid credentials, and token provider payload.
- [x] Implement provider dataclass, JSON path extraction, enterprise auth config, and sanitized auth errors.
- [x] Keep GitHub OAuth behavior compatible by generating tokens through the common identity helper.
- [x] Run `uv run pytest tests/test_auth.py`.

### Task 2: Frontend pa-eval-login Module

**Files:**
- Create: `pa-eval-frontend/src/modules/pa-eval-login/auth-api.ts`
- Create: `pa-eval-frontend/src/modules/pa-eval-login/login-url.ts`
- Create: `pa-eval-frontend/src/modules/pa-eval-login/index.tsx`
- Create: `pa-eval-frontend/src/modules/pa-eval-login/session.ts`
- Create: `pa-eval-frontend/src/modules/pa-eval-login/use-auth-profile-menu.ts`
- Modify: `pa-eval-frontend/src/main.tsx`
- Modify: `pa-eval-frontend/src/routes/index.tsx`
- Modify: `pa-eval-frontend/src/hooks/use-auth-profile-menu.ts`
- Test: `pa-eval-frontend/src/tests/pa-eval-login-source.test.ts`
- Test: `pa-eval-frontend/src/tests/login-url.test.ts`

**Interfaces:**
- Produces: `Login`, `buildAuthLoginUrl`, `loginWithEnterprisePassword`, `loadCurrentSession`, `defaultSession`, `useAuthProfileMenu`.
- Consumes: Existing `request`, `env`, `useSessionStore`, and `useEnvironmentStore`.

- [x] Write failing frontend tests proving login code lives under `pa-eval-login`, legacy imports are compatibility wrappers, and URL builders support GitHub and SSO.
- [x] Create module files and keep legacy `hooks/use-auth-profile-menu.ts` as a wrapper to avoid touching business code.
- [x] Update root route and bootstrap to import from `pa-eval-login`.
- [x] Run targeted node tests and `npm run typecheck`.

### Task 3: Verification

**Files:**
- No new production files.

**Interfaces:**
- Consumes: Task 1 and Task 2 outputs.

- [x] Run `uv run pytest tests/test_auth.py tests/test_user_session.py`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `npm run lint` and document existing unrelated failures if still present.
