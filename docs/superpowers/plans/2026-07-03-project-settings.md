# Project Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frontend-only project settings module at `/projects/:projectId/settings` with mock UI interactions.

**Architecture:** Add a focused `project-settings` module under the existing `SidebarLayout` project routes. The parent page owns the settings layout and child routes; each child page owns its own local mock state. No backend calls are introduced.

**Tech Stack:** React, TypeScript, React Router, Tailwind CSS v4, Radix/shadcn UI components, lucide-react, sonner toast.

---

## File Structure

- Create `pa-eval-frontend/src/modules/project-settings/index.tsx`: parent settings page and index redirect.
- Create `pa-eval-frontend/src/modules/project-settings/nav.tsx`: child settings navigation.
- Create `pa-eval-frontend/src/modules/project-settings/types.ts`: local UI types.
- Create `pa-eval-frontend/src/modules/project-settings/data/mock.ts`: static mock data.
- Create `pa-eval-frontend/src/modules/project-settings/views/general.tsx`: general settings form.
- Create `pa-eval-frontend/src/modules/project-settings/views/score-configs.tsx`: score config list and dialog.
- Create `pa-eval-frontend/src/modules/project-settings/views/members.tsx`: project member list and dialog.
- Create `pa-eval-frontend/src/modules/project-settings/views/models.tsx`: model defaults, LLM connections, model definitions.
- Create `pa-eval-frontend/src/modules/project-settings/views/api-keys.tsx`: API key list and one-time secret dialog.
- Create `pa-eval-frontend/src/tests/project-settings.types.test.tsx`: type-level usage coverage for new module.
- Modify `pa-eval-frontend/src/routes/index.tsx`: import module and add project settings routes.
- Modify `pa-eval-frontend/mock/sidebar.ts`: add project settings item beside evaluation and observability.

## Task 1: Add Failing Type Coverage

**Files:**
- Create: `pa-eval-frontend/src/tests/project-settings.types.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import {
  ProjectSettings,
  ProjectSettingsIndexRedirect,
} from '@/modules/project-settings'
import { projectSettingsNavigationItems } from '@/modules/project-settings/nav'
import { ProjectGeneralSettings } from '@/modules/project-settings/views/general'
import { ProjectScoreConfigsSettings } from '@/modules/project-settings/views/score-configs'
import { ProjectMembersSettings } from '@/modules/project-settings/views/members'
import { ProjectModelsSettings } from '@/modules/project-settings/views/models'
import { ProjectApiKeysSettings } from '@/modules/project-settings/views/api-keys'

export function ProjectSettingsTypeUsage() {
  return (
    <>
      <ProjectSettings />
      <ProjectSettingsIndexRedirect />
      <ProjectGeneralSettings />
      <ProjectScoreConfigsSettings />
      <ProjectMembersSettings />
      <ProjectModelsSettings />
      <ProjectApiKeysSettings />
      <span>
        {projectSettingsNavigationItems.map((item) => item.href).join(',')}
      </span>
    </>
  )
}
```

- [ ] **Step 2: Verify RED**

Run: `npm run typecheck`

Expected: FAIL because `@/modules/project-settings` and its child exports do not exist.

## Task 2: Create Module Shell and Routes

**Files:**
- Create: `pa-eval-frontend/src/modules/project-settings/index.tsx`
- Create: `pa-eval-frontend/src/modules/project-settings/nav.tsx`
- Modify: `pa-eval-frontend/src/routes/index.tsx`
- Modify: `pa-eval-frontend/mock/sidebar.ts`

- [ ] **Step 1: Add settings navigation**

Create `nav.tsx` with items for general, score configs, members, models, and API Keys. Use functions so the current `projectId` builds concrete hrefs.

- [ ] **Step 2: Add parent page**

Create `ProjectSettings` using `Page`, `Separator`, `SidebarNav`, and `Outlet`. Use `useParams()` to resolve `projectId`, with `project_customer_agent` as the mock fallback.

- [ ] **Step 3: Add route imports and route objects**

Add the project settings parent route under the existing `SidebarLayout` branch:

```tsx
{
  path: 'projects/:projectId/settings',
  element: <ProjectSettings />,
  children: [
    { index: true, element: <ProjectSettingsIndexRedirect /> },
    { path: 'general', element: <ProjectGeneralSettings /> },
    { path: 'score-configs', element: <ProjectScoreConfigsSettings /> },
    { path: 'members', element: <ProjectMembersSettings /> },
    { path: 'models', element: <ProjectModelsSettings /> },
    { path: 'api-keys', element: <ProjectApiKeysSettings /> },
  ],
}
```

- [ ] **Step 4: Add sidebar item**

Add a `项目设置` item to `mock/sidebar.ts`:

```ts
{
  title: '项目设置',
  url: '/projects/project_customer_agent/settings/general',
  icon: 'Settings',
  activeMatch: 'prefix',
}
```

## Task 3: Add Mock Types and Data

**Files:**
- Create: `pa-eval-frontend/src/modules/project-settings/types.ts`
- Create: `pa-eval-frontend/src/modules/project-settings/data/mock.ts`

- [ ] **Step 1: Define UI types**

Define project info, score config, member, LLM connection, model definition, default model, and API key types. Keep enum unions local and aligned with the PRD values.

- [ ] **Step 2: Define initial data**

Create one realistic project info object and small lists for each settings section. All secrets must be fake and clearly mock values.

## Task 4: Implement General Settings

**Files:**
- Create: `pa-eval-frontend/src/modules/project-settings/views/general.tsx`

- [ ] **Step 1: Build form UI**

Use `ContentSection`, `Input`, `Textarea`, `Button`, and `Badge` to show editable project name/description plus read-only project metadata.

- [ ] **Step 2: Save locally**

On submit, update local state and call `toast.success('项目基础信息已保存')`.

## Task 5: Implement Score Configs and Members

**Files:**
- Create: `pa-eval-frontend/src/modules/project-settings/views/score-configs.tsx`
- Create: `pa-eval-frontend/src/modules/project-settings/views/members.tsx`

- [ ] **Step 1: Build score configs page**

Use shadcn `Table`, `Badge`, `Dialog`, `Select`, `Input`, and `Textarea`. Support create, edit, and archive by updating local state.

- [ ] **Step 2: Build members page**

Use shadcn `Table`, `Badge`, `Dialog`, and `Select`. Support create, role edit, and delete by updating local state.

## Task 6: Implement Models and API Keys

**Files:**
- Create: `pa-eval-frontend/src/modules/project-settings/views/models.tsx`
- Create: `pa-eval-frontend/src/modules/project-settings/views/api-keys.tsx`

- [ ] **Step 1: Build models page**

Use three sections for default model, LLM connections, and model definitions. Support local create/edit/delete flows where required by the PRD.

- [ ] **Step 2: Build API Keys page**

Support create, note edit, and delete. On create, show a one-time fake secret in a dialog, while the table only shows masked secret values.

## Task 7: Verify and Refine

**Files:**
- All files above.

- [ ] **Step 1: Verify GREEN**

Run: `npm run typecheck`

Expected: PASS or only failures unrelated to this change. Any failures in new files must be fixed.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS or only pre-existing unrelated failures. Any failures in new files must be fixed.

- [ ] **Step 3: Review changed files**

Run: `git diff -- pa-eval-frontend/src/modules/project-settings pa-eval-frontend/src/routes/index.tsx pa-eval-frontend/mock/sidebar.ts pa-eval-frontend/src/tests/project-settings.types.test.tsx`

Expected: Diff only contains project settings UI, route registration, sidebar mock entry, and the type usage test.

## Self-Review

- Spec coverage: route, sidebar entry, five settings sections, mock-only interactions, and validation commands are covered.
- Placeholder scan: no TBD/TODO placeholders are required for implementation.
- Type consistency: component names used in tests match planned exports.
- Commit handling: no commit step is included because project rules prohibit automatic commits.
