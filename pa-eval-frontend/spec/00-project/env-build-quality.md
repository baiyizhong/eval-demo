# Env Build Quality Spec

## 适用任务

- 处理与本文标题相关的开发、重构或评审任务。

## 相关源码

- 以本文后续“适用范围”“项目事实”“组件定位”“文件职责”列出的路径为准。

## 必读前置

- `spec/README.md`

## 核心规则

- 先阅读本文后续的目标、必须遵守、规则和使用约定，再修改代码。

## 推荐示例

- 优先采用本文后续推荐用法和模板示例。

## 禁止事项

- 以本文后续“禁止事项”“约束”“大模型修改约束”为准。

## 检查清单

- 按本文后续检查清单和 `spec/README.md` 验证命令完成自检。

## 目标

规范环境变量、Vite 配置、脚本和质量门禁，保证开发、构建和部署行为一致。

## 适用范围

- `.env*`
- `src/config/env.ts`
- `src/config/app.ts`
- `vite.config.ts`
- `package.json`
- `package-lock.json`
- `components.json`
- `eslint.config.js`
- `.prettierrc`
- `tests/*`
- `public/*`
- 任何涉及构建、代理、部署路径或质量检查的任务

## 项目事实

- `package.json` 要求 Node.js `>=22.22.0`。
- 运行时环境读取集中在 `src/config/env.ts`。
- 应用配置适配位于 `src/config/app.ts`。
- Vite 配置位于 `vite.config.ts`。
- 当前工程工具链使用 React 19、React Router 8、Vite 8、TypeScript 5、ESLint 9、Prettier 3。
- 当前 UI 基础设施使用 shadcn/ui 源码型组件体系、Tailwind CSS v4、Lucide React、Sonner、Recharts。
- Vite 已配置 React plugin、Tailwind CSS v4 plugin、`publicDir: 'public'`、`@` alias、proxy、manual chunks。
- `package.json` 已提供 `dev`、`build`、`preview`、`typecheck`、`lint`、`lint:fix`、`format`、`format:check`。。
- Vite dev server 会从应用根路径托管 `public/` 资源，build 会将 `public/` 下的资源原样复制到 `dist/` 根路径。
- 测试文件应放在 `tests/`，不放入 `src/` 应用源码目录。

## 环境变量

推荐变量：

```txt
VITE_APP_TITLE=
VITE_APP_BASE_PATH=
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=
VITE_API_TIMEOUT=
VITE_API_WITH_CREDENTIALS=
VITE_ENABLE_MOCK=
VITE_BUILD_SOURCEMAP=
```

当前 `src/config/env.ts` 已读取：

- `VITE_APP_TITLE`
- `VITE_APP_BASE_PATH`
- `VITE_API_BASE_URL`
- `VITE_API_TIMEOUT`
- `VITE_API_WITH_CREDENTIALS`
- `VITE_ENABLE_MOCK`
- `VITE_BUILD_SOURCEMAP`

当前 `vite.config.ts` 已读取：

- `VITE_APP_BASE_PATH`
- `VITE_API_PROXY_TARGET`
- `VITE_BUILD_SOURCEMAP`

## 必须遵守

- 应用代码通过 `src/config/env.ts` 读取环境值。
- Vite 配置通过 `loadEnv` 读取环境值。
- 本地开发、安装依赖和运行脚本必须使用满足 `package.json` `engines.node` 的 Node.js 版本。
- 非根路径部署通过 `VITE_APP_BASE_PATH` 配置。
- 后端基础路径通过 `VITE_API_BASE_URL` 配置。
- 开发代理目标通过 `VITE_API_PROXY_TARGET` 配置。
- 布尔环境变量使用字符串 `true` 表示开启。
- `.env.local` 用于本地私有配置，不提交到 git。
- 修改构建、环境或代理行为后应运行 `npm run build`。
- 修改 `public/` 或 `publicDir` 后，应同时验证 dev server 根路径访问和 build 产物复制。
- 测试文件统一放入 `tests/`，按领域分目录。
- 新增、删除或升级依赖必须使用包管理器，并同步提交 `package.json` 和对应 lock 文件。

## 禁止事项

- 不要在业务代码中直接硬编码后端 host。
- 不要在业务代码中散落读取裸 `import.meta.env`。
- 不要把密钥写入前端 `.env`，Vite `VITE_` 变量会暴露到客户端。
- 不要绕开 `VITE_APP_BASE_PATH` 处理部署子路径。
- 不要删除现有质量脚本。
- 不要把测试文件放入 `src/`。
- 不要只修改 `package.json` 而遗漏 `package-lock.json`。
- 不要手写 lock 文件代替包管理器生成结果。
- 不要手写修改 `components.json` 后跳过真实组件路径、alias 和主题入口验证。

## 标准流程

新增环境变量：

1. 判断该变量是否需要暴露给前端。只有需要客户端读取时才使用 `VITE_` 前缀。
2. 在 `src/config/env.ts` 中读取并规范化。
3. 如 Vite 构建阶段需要，在 `vite.config.ts` 中通过 `loadEnv` 读取。
4. 更新相关 spec 或说明文档。
5. 运行 `npm run typecheck`，涉及构建时运行 `npm run build`。

修改构建配置：

1. 读取 `vite.config.ts` 当前配置。
2. 保留 React、Tailwind、publicDir、alias、proxy、manual chunks 的既有行为。
3. 运行 `npm run build`。

修改 public 资源：

1. 文件放在 `public/` 下。
2. 代码或文档中的访问路径不要包含 `/public` 前缀。
3. 运行 dev server，验证资源可通过应用根路径访问。
4. 运行 `npm run build`，验证资源已复制到 `dist/` 根路径。

新增测试：

1. 在 `tests/<domain>/` 下创建测试文件。
2. 测试文件按被测文件或行为命名，例如 `tests/api/create-api.test.ts`。
3. 如果需要新增测试运行器，使用包管理器安装，并确认 `package.json` 和 lock 文件同时更新。
4. 运行对应测试命令，并至少运行 `npm run lint`。

新增依赖：

1. 确认依赖确实需要引入，优先复用现有技术栈。
2. 使用当前项目包管理器安装依赖；当前项目使用 npm，因为存在 `package-lock.json`。
3. 确认 `package.json` 和 `package-lock.json` 同步变化。
4. 运行受影响的验证命令。


## 质量门禁

代码变更完成前按影响范围运行：

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

最小验证建议：

- 只改类型或 TS 逻辑：`npm run typecheck`
- 改 React 组件或 hooks：`npm run typecheck`、`npm run lint`
- 改格式化相关文件：`npm run format:check`
- 改 Vite、环境、路由入口或构建相关代码：`npm run build`
- 改 `public/` 资源：dev server 根路径访问检查、`npm run build`
- 改测试：对应测试命令、`npm run lint`
- 改依赖：确认 `package.json` 和 lock 文件变化，并运行受影响验证命令
- 只改文档：检查路径、链接、命令和真实文件是否一致


## 检查清单

- 环境变量读取集中在配置层。
- 没有把敏感信息写入客户端变量。
- API base path 和 proxy target 职责没有混淆。
- 非根路径部署仍使用 `env.appBasePath`。
- `public/` 资源可以通过应用根路径访问，路径没有误写 `/public` 前缀。
- 测试文件位于 `tests/`。
- 如有依赖变化，`package.json` 和 lock 文件已同步。
