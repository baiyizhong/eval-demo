# Organization Management Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PA Eval organization management frontend mock flow: organization switcher, organization info, members, import, and API key management.

**Architecture:** Keep `/settings` as the organization management entry and split the feature into a focused module under `pa-eval-frontend/src/modules/organization-management`. Use global organization state because the selected organization will later affect project management and project-scoped pages. Mock API handlers emulate the backend contract while keeping the public API aliases stable for future real backend integration.

**Tech Stack:** React 19, TypeScript, Vite, React Router 8, React Query, Zustand, TailwindCSS, shadcn/Radix UI, lucide-react, vite-plugin-mock.

## Global Constraints

- Always respond in Chinese-simplified.
- Do not modify `langfuse/`.
- Do not modify Langfuse native database table structures.
- PA custom tables, if ever needed later, must start with `pa_`; this frontend-only task does not add tables.
- API responses use `{ code: number, message: string, data: any, txId: string }`.
- Pagination request params are `page` and `pageSize`; paginated data shape is `{ total: number, datas: any[] }`.
- Frontend API calls go through `useAPI()` and aliases registered in `src/api/registry.ts`.
- New frontend modules live under `src/modules/<module-name>/`.
- Use `lucide-react` icons.
- Do not auto-commit. Replace commit steps with `git status --short` and `git diff --check`.

---

## File Structure

- Create `pa-eval-frontend/src/modules/organization-management/api/index.ts`: API alias definitions.
- Create `pa-eval-frontend/src/modules/organization-management/data/schema.ts`: organization, member, API key, role, and helper types.
- Create `pa-eval-frontend/src/stores/organization.store.ts`: selected organization and organization list state.
- Create `pa-eval-frontend/src/modules/organization-management/hooks/use-organizations.ts`: React Query loading and store synchronization.
- Create `pa-eval-frontend/src/modules/organization-management/components/organization-switcher.tsx`: topbar organization switcher and create organization entry.
- Create `pa-eval-frontend/src/modules/organization-management/components/create-organization-drawer.tsx`: shared create organization drawer.
- Create `pa-eval-frontend/src/modules/organization-management/components/empty-organization-state.tsx`: no-organization fallback.
- Create `pa-eval-frontend/src/modules/organization-management/views/info/index.tsx`: organization info page.
- Create `pa-eval-frontend/src/modules/organization-management/views/info/organization-info-form.tsx`: editable organization info form.
- Create `pa-eval-frontend/src/modules/organization-management/views/members/index.tsx`: members table page.
- Create `pa-eval-frontend/src/modules/organization-management/views/members/member-form-drawer.tsx`: add/edit member drawer.
- Create `pa-eval-frontend/src/modules/organization-management/views/members/member-import-result-dialog.tsx`: import result dialog.
- Create `pa-eval-frontend/src/modules/organization-management/views/api-keys/index.tsx`: API key table page.
- Create `pa-eval-frontend/src/modules/organization-management/views/api-keys/create-api-key-dialog.tsx`: create key dialog with one-time secret display.
- Create `pa-eval-frontend/src/modules/organization-management/data/permissions.test.ts`: role rule tests.
- Create `pa-eval-frontend/src/modules/organization-management/data/permissions.ts`: role rule helpers.
- Create `pa-eval-frontend/src/tests/organization-switcher.types.test.tsx`: type-level render contract test.
- Create `pa-eval-frontend/mock/organizations.ts`: mock API data and handlers.
- Modify `pa-eval-frontend/src/api/registry.ts`: register organization API aliases.
- Modify `pa-eval-frontend/src/routes/index.tsx`: route `/settings` to organization subpages and wire topbar switcher.
- Modify `pa-eval-frontend/src/modules/settings/index.tsx`: convert settings shell to organization management shell.

## Task 1: API Types, Role Rules, Store, and Mock Registry

**Files:**
- Create: `pa-eval-frontend/src/modules/organization-management/api/index.ts`
- Create: `pa-eval-frontend/src/modules/organization-management/data/schema.ts`
- Create: `pa-eval-frontend/src/modules/organization-management/data/permissions.ts`
- Create: `pa-eval-frontend/src/modules/organization-management/data/permissions.test.ts`
- Create: `pa-eval-frontend/src/stores/organization.store.ts`
- Modify: `pa-eval-frontend/src/api/registry.ts`

**Interfaces:**
- Produces type `OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'`.
- Produces `canManageMembers(role)`, `canAssignRole(actorRole, targetRole)`, `canRemoveMember(actorRole, targetRole, ownerCount)`.
- Produces Zustand hook `useOrganizationStore`.
- Produces API aliases consumed by later tasks: `getOrganizations`, `createOrganization`, `getOrganization`, `updateOrganization`, `getOrganizationMembers`, `createOrganizationMember`, `updateOrganizationMember`, `deleteOrganizationMember`, `importOrganizationMembers`, `getOrganizationApiKeys`, `createOrganizationApiKey`, `deleteOrganizationApiKey`.

- [ ] **Step 1: Write failing role-rule tests**

Create `pa-eval-frontend/src/modules/organization-management/data/permissions.test.ts`:

```ts
import {
  canAssignRole,
  canManageMembers,
  canRemoveMember,
} from './permissions'

describe('organization role permissions', () => {
  it('allows owner to manage members and assign owner', () => {
    expect(canManageMembers('OWNER')).toBe(true)
    expect(canAssignRole('OWNER', 'OWNER')).toBe(true)
  })

  it('allows admin to manage members but not assign owner', () => {
    expect(canManageMembers('ADMIN')).toBe(true)
    expect(canAssignRole('ADMIN', 'OWNER')).toBe(false)
    expect(canAssignRole('ADMIN', 'MEMBER')).toBe(true)
  })

  it('blocks member and viewer from member management', () => {
    expect(canManageMembers('MEMBER')).toBe(false)
    expect(canManageMembers('VIEWER')).toBe(false)
  })

  it('prevents deleting owner as admin and prevents deleting the last owner', () => {
    expect(canRemoveMember('ADMIN', 'OWNER', 2)).toEqual({
      allowed: false,
      reason: 'Admin 不能删除 Owner',
    })
    expect(canRemoveMember('OWNER', 'OWNER', 1)).toEqual({
      allowed: false,
      reason: '不能删除最后一个 Owner',
    })
    expect(canRemoveMember('OWNER', 'ADMIN', 1)).toEqual({ allowed: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pa-eval-frontend && npm run typecheck`

Expected: fails because `permissions.ts` does not exist.

- [ ] **Step 3: Add schemas and permission helpers**

Create `pa-eval-frontend/src/modules/organization-management/data/schema.ts` with exported types for organization, member, API key, paginated result, form payloads, and import failures. Create `permissions.ts` with the exact functions tested above.

- [ ] **Step 4: Add API aliases and organization store**

Create `api/index.ts` with endpoint configs under `/organizations...`. Add `organizationApi` to `src/api/registry.ts`. Create `src/stores/organization.store.ts` with `organizations`, `currentOrganizationId`, `isLoaded`, `setOrganizations`, `setCurrentOrganizationId`, `upsertOrganization`, and selector `getCurrentOrganization`.

- [ ] **Step 5: Verify task**

Run: `cd pa-eval-frontend && npm run typecheck`

Expected: PASS.

Run: `git diff --check && git status --short`

Expected: no whitespace errors; changed files are the task files only.

## Task 2: Mock Organization API

**Files:**
- Create: `pa-eval-frontend/mock/organizations.ts`

**Interfaces:**
- Consumes types and role helpers from Task 1.
- Produces mock handlers for all aliases registered in Task 1.
- Mock responses return `{ code, message, data, txId }`; lists return `{ total, datas }`.

- [ ] **Step 1: Add mock dataset and response helpers**

Create in-memory organizations, members, and API keys. Include at least:

- one owner organization
- one admin organization
- one member/viewer scenario for disabled operation checks
- at least 12 members to exercise pagination

- [ ] **Step 2: Implement list, create, detail, and update handlers**

Implement:

- `GET /api/organizations`
- `POST /api/organizations`
- `GET /api/organizations/:organizationId`
- `PATCH /api/organizations/:organizationId`

Rules:

- creation generates `org-<timestamp>`, `pk-live-...`, and `sk-live-...`
- creating organization adds current user as `OWNER`
- updating organization rejects `name` changes with non-zero `code`

- [ ] **Step 3: Implement member handlers**

Implement paginated list, create, role update, delete, and import. Use `page` and `pageSize`; filter by `keyword`; reject role operations that violate `permissions.ts`.

- [ ] **Step 4: Implement API key handlers**

Implement paginated list, create, and delete. Creation returns `secretKey` once; list returns only `secretKeyMasked`.

- [ ] **Step 5: Verify task**

Run: `cd pa-eval-frontend && npm run typecheck`

Expected: PASS.

Run: `git diff --check && git status --short`

Expected: no whitespace errors; mock file is tracked in status.

## Task 3: Organization Loader, Switcher, and Topbar Integration

**Files:**
- Create: `pa-eval-frontend/src/modules/organization-management/hooks/use-organizations.ts`
- Create: `pa-eval-frontend/src/modules/organization-management/components/organization-switcher.tsx`
- Create: `pa-eval-frontend/src/modules/organization-management/components/create-organization-drawer.tsx`
- Create: `pa-eval-frontend/src/tests/organization-switcher.types.test.tsx`
- Modify: `pa-eval-frontend/src/components/layout/top-nav.tsx`
- Modify: `pa-eval-frontend/src/routes/index.tsx`

**Interfaces:**
- Consumes API aliases and store from Task 1.
- Produces `OrganizationSwitcher` used by `TopNav`.
- Extends `TopNavProps` with optional `rightSlot?: React.ReactNode`.

- [ ] **Step 1: Add type contract test**

Create `src/tests/organization-switcher.types.test.tsx` importing `<OrganizationSwitcher />` and `<TopNav rightSlot={<OrganizationSwitcher />} ... />` to catch prop/type drift during `typecheck`.

- [ ] **Step 2: Implement `useOrganizations`**

Use React Query to call `getOrganizations`, then sync the result into `useOrganizationStore.setOrganizations`. Keep first organization selected by default if no current organization exists.

- [ ] **Step 3: Implement create organization drawer**

Use `Drawer`, `BaseForm`, `zod`, `Input`, and `Textarea`. Fields:

- `name`
- `subsystem`
- `description`

On success, call `createOrganization`, upsert into store, select it, invalidate organization query, show toast.

- [ ] **Step 4: Implement organization switcher**

Use `DropdownMenu` and `Button`. Display:

- current organization name
- `暂无组织` when none exists
- menu items for each organization
- `创建组织` item that opens the drawer

- [ ] **Step 5: Add topbar slot and route integration**

Add `rightSlot` rendering in `TopNav` before `ProfileDropdown`. In `routes/index.tsx`, pass `<OrganizationSwitcher />` as `appsTopbarNavigation.rightSlot`.

- [ ] **Step 6: Verify task**

Run: `cd pa-eval-frontend && npm run typecheck`

Expected: PASS.

Open `http://localhost:5173/apps`; expected: topbar shows organization switcher next to user controls.

## Task 4: Settings Shell and Organization Info Page

**Files:**
- Create: `pa-eval-frontend/src/modules/organization-management/components/empty-organization-state.tsx`
- Create: `pa-eval-frontend/src/modules/organization-management/views/info/index.tsx`
- Create: `pa-eval-frontend/src/modules/organization-management/views/info/organization-info-form.tsx`
- Modify: `pa-eval-frontend/src/modules/settings/index.tsx`
- Modify: `pa-eval-frontend/src/routes/index.tsx`

**Interfaces:**
- Consumes current organization from `useOrganizationStore`.
- Consumes `updateOrganization` API alias.
- Produces `/settings/info`.

- [ ] **Step 1: Update settings shell**

Change title to `组织管理`, description to `管理当前组织的信息、成员和 API Key。`, and sidebar items to:

- `组织信息` -> `/settings/info`
- `组织人员` -> `/settings/members`
- `API Key 管理` -> `/settings/api-keys`

- [ ] **Step 2: Update routes**

Change `/settings` index redirect from `account` to `info`. Add route entries for info, members, and api-keys views.

- [ ] **Step 3: Implement empty organization state**

Show concise empty state with a `创建组织` button that opens `CreateOrganizationDrawer`.

- [ ] **Step 4: Implement organization info form**

Use read-only organization name, editable subsystem and description, read-only public key with copy button, masked secret key. Submit calls `updateOrganization` and upserts store.

- [ ] **Step 5: Verify task**

Run: `cd pa-eval-frontend && npm run typecheck`

Expected: PASS.

Open `http://localhost:5173/settings`; expected: redirects to `/settings/info` and shows organization information or empty state.

## Task 5: Members Page, Role Operations, and Import Results

**Files:**
- Create: `pa-eval-frontend/src/modules/organization-management/views/members/index.tsx`
- Create: `pa-eval-frontend/src/modules/organization-management/views/members/member-form-drawer.tsx`
- Create: `pa-eval-frontend/src/modules/organization-management/views/members/member-import-result-dialog.tsx`

**Interfaces:**
- Consumes `DataTable`, `ImportDialog`, `ConfirmDialog`, role helpers, current organization, and member API aliases.
- Produces `/settings/members`.

- [ ] **Step 1: Implement member form drawer**

Fields:

- `name`
- `email`
- `role`

For `ADMIN`, do not offer `OWNER` as a role option. Submit calls create or update member API.

- [ ] **Step 2: Implement members table**

Use `DataTable` with query key `['organization-members', organizationId]`. Query passes `page`, `pageSize`, `keyword`, and role filter. Columns:

- name
- email
- role badge
- status
- joinedAt
- actions

- [ ] **Step 3: Implement member actions**

Actions:

- add member
- edit role
- delete member with `ConfirmDialog`
- hide or disable actions when current role is `MEMBER` or `VIEWER`
- prevent admin from operating on owners

- [ ] **Step 4: Implement import flow**

Use `ImportDialog` with `.csv` and `text/csv`. On import, call mock import API and show `MemberImportResultDialog` with success count and failures by row, field, reason.

- [ ] **Step 5: Verify task**

Run: `cd pa-eval-frontend && npm run typecheck`

Expected: PASS.

Open `http://localhost:5173/settings/members`; expected: table paginates with `page` and `pageSize`, import failures show row/field/reason, last owner deletion is blocked.

## Task 6: API Key Page and One-Time Secret Display

**Files:**
- Create: `pa-eval-frontend/src/modules/organization-management/views/api-keys/index.tsx`
- Create: `pa-eval-frontend/src/modules/organization-management/views/api-keys/create-api-key-dialog.tsx`

**Interfaces:**
- Consumes current organization and API key API aliases.
- Produces `/settings/api-keys`.

- [ ] **Step 1: Implement create key dialog**

Input:

- `name`

Before creation, show form state. After creation, replace form with one-time result showing:

- `publicKey`
- `secretKey`
- copy buttons
- warning text that secret is shown only once

- [ ] **Step 2: Implement API key table**

Use `DataTable` with columns:

- name
- publicKey
- secretKeyMasked
- createdBy
- createdAt
- lastUsedAt
- actions

- [ ] **Step 3: Implement delete action**

Use `ConfirmDialog`; delete calls API alias and invalidates table query.

- [ ] **Step 4: Verify task**

Run: `cd pa-eval-frontend && npm run typecheck`

Expected: PASS.

Open `http://localhost:5173/settings/api-keys`; expected: creating a key shows raw secret once, table only shows masked secret.

## Task 7: End-to-End Polish and Verification

**Files:**
- Modify only files created or touched by Tasks 1-6 if issues are found.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified frontend mock flow.

- [ ] **Step 1: Run static checks**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
```

Expected: PASS.

Run:

```bash
cd pa-eval-frontend
npm run lint
```

Expected: PASS or only pre-existing unrelated lint warnings; document any failures.

- [ ] **Step 2: Manual browser verification**

With the dev server already running at `http://localhost:5173/apps`, verify:

- topbar shows organization switcher
- creating organization switches current organization
- `/settings` redirects to `/settings/info`
- organization name is read-only
- member pagination uses `page` and `pageSize`
- Admin cannot assign Owner
- deleting last Owner is blocked
- import result lists row, field, reason
- API key secret appears only after creation and list is masked

- [ ] **Step 3: Final diff check**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; no `langfuse/` files changed.
