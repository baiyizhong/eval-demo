# TopNav 组件使用规范

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

## 组件职责

`top-nav` 是一个纯展示型顶部导航栏组件。它负责渲染品牌区、导航菜单、右侧操作入口、用户头像和用户悬浮卡片。

组件不内置业务数据，不绑定路由库，不处理登录退出等业务逻辑。所有展示数据必须由调用方传入，所有交互通过回调交给调用方处理。

## 导入方式

```tsx
import { BookOpen, LogOut, ShieldCheck } from "lucide-react";
import {
  TopNav,
  type TopNavAction,
  type TopNavBrand,
  type TopNavItem,
  type TopNavUser,
} from "@/components/layout/top-nav.tsx";
```

## 类型说明

```tsx
type TopNavBrand = {
  name: string;
  initial?: string;
  href?: string;
  ariaLabel?: string;
};

type TopNavItem = {
  id: string;
  label: string;
  href: string;
  active?: boolean;
  highlighted?: boolean;
};

type TopNavAction = {
  id: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  title?: string;
  ariaLabel?: string;
};

type TopNavUser = {
  name: string;
  email?: string;
  initials?: string;
  avatarUrl?: string;
};
```

## Props 契约

```tsx
type TopNavProps = {
  brand: TopNavBrand;
  items: TopNavItem[];
  inlineActions: TopNavAction[];
  user?: TopNavUser | null;
  menuActions?: TopNavAction[];
  onNavigate?: (
    item: TopNavItem,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
  onAction?: (
    action: TopNavAction,
    event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
  ) => void;
  className?: string;
  containerClassName?: string;
};
```

关键规则：

- `brand`、`items`、`inlineActions` 必须由调用方传入。
- 不要在 `top-nav.tsx` 中新增默认菜单、默认品牌、默认用户或默认操作数据。
- 不要新增 `onLogout`。退出登录必须建模为 `TopNavAction`，通过 `menuActions` 传入，并由统一的 `onAction` 处理。
- `user` 为 `null` 或 `undefined` 时，不渲染用户头像和悬浮卡片。
- `menuActions` 仅显示在用户悬浮卡片中，典型用途是退出登录、个人设置等用户菜单操作。
- `TopNav` 不主动调用 `event.preventDefault()`。如果要接入路由跳转，由调用方在 `onNavigate` 或 `onAction` 中自行处理。

## 推荐用法

```tsx
const navigationBrand: TopNavBrand = {
  name: "示例公司",
  initial: "A",
  href: "#",
  ariaLabel: "返回首页",
};

const navigationItems: TopNavItem[] = [
  { id: "home", label: "首页", href: "/" },
  { id: "docs", label: "文档", href: "/docs" },
  { id: "components", label: "组件", href: "/components", active: true },
];

const inlineActions: TopNavAction[] = [
  {
    id: "help",
    label: "帮助文档",
    href: "/help",
    icon: BookOpen,
    title: "帮助文档",
    ariaLabel: "帮助文档",
  },
  {
    id: "permissions",
    label: "申请权限",
    href: "/permissions",
    icon: ShieldCheck,
    title: "申请权限",
    ariaLabel: "申请权限",
  },
];

const currentUser: TopNavUser = {
  name: "PANJIANJIAN065",
  email: "panjianjian065@example.com",
  initials: "P",
};

const menuActions: TopNavAction[] = [
  {
    id: "logout",
    label: "退出登录",
    href: "#",
    icon: LogOut,
    title: "退出登录",
    ariaLabel: "退出登录",
  },
];

function handleNavigate(
  item: TopNavItem,
  event: MouseEvent<HTMLAnchorElement>,
) {
  event.preventDefault();
  // router.navigate(item.href)
}

function handleAction(
  action: TopNavAction,
  event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
) {
  if (action.id === "logout") {
    event.preventDefault();
    // logout()
    return;
  }

  if (action.href) {
    event.preventDefault();
    // router.navigate(action.href)
  }
}

<TopNav
  brand={navigationBrand}
  items={navigationItems}
  inlineActions={inlineActions}
  user={currentUser}
  menuActions={menuActions}
  onNavigate={handleNavigate}
  onAction={handleAction}
/>;
```

## 路由接入约定

组件内部始终渲染原生 `<a>` 或 `<button>`，不直接依赖 `react-router`、`next/link` 或其他路由组件。

接入路由时：

- 在 `onNavigate` 中根据 `item.href` 跳转。
- 在 `onAction` 中根据 `action.id` 或 `action.href` 区分具体行为。
- 如需阻止浏览器默认跳转，在回调中显式调用 `event.preventDefault()`。

示例：

```tsx
function handleNavigate(item, event) {
  event.preventDefault();
  navigate(item.href);
}

function handleAction(action, event) {
  if (action.id === "logout") {
    event.preventDefault();
    logout();
    return;
  }

  if (action.href) {
    event.preventDefault();
    navigate(action.href);
  }
}
```

## 状态和显示规则

- `item.active` 表示当前页面，组件会设置 `aria-current="page"`。
- `item.highlighted` 和 `item.active` 都会使用强调色样式。
- `brand.initial` 未传时，组件使用 `brand.name` 的首字符大写作为标识。
- `user.initials` 未传时，组件使用 `user.name` 的首字符大写作为头像 fallback。
- `user.avatarUrl` 存在时渲染头像图片，同时保留 `AvatarFallback`。

## 大模型修改约束

大模型在修改该组件时必须遵守：

- 不要把示例公司、菜单项、用户信息、帮助文档、申请权限、退出登录等业务数据写回 `top-nav.tsx`。
- 不要新增独立的 `onLogout`、`onHelp`、`onPermission` 等专用事件；统一使用 `onAction`，通过 `action.id` 区分。
- 不要让组件直接依赖路由库；路由跳转只能写在调用方。
- 不要改变现有视觉结构，除非用户明确要求调整 UI。
- 新增右侧入口时，优先扩展调用方的 `inlineActions` 数组。
- 新增用户菜单入口时，优先扩展调用方的 `menuActions` 数组；不要直接在组件里硬编码菜单项。
