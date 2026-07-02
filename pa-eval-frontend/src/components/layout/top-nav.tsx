import type { MouseEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ProfileDropdown } from '@/components/common/profile-dropdown'
import type { ActiveMatch } from '@/lib/nav'
import { cn } from '@/lib/utils'

export type TopNavBrand = {
  name: string;
  initial?: string;
  href?: string;
  ariaLabel?: string;
};

export type TopNavItem = {
  id: string;
  label: string;
  href: string;
  activeMatch?: ActiveMatch;
  active?: boolean;
  highlighted?: boolean;
};

export type TopNavAction = {
  id: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  title?: string;
  ariaLabel?: string;
};

export type TopNavUser = {
  name: string;
  email?: string;
  initials?: string;
  avatarUrl?: string;
};

export type TopNavProps = {
  brand: TopNavBrand;
  items: TopNavItem[];
  inlineActions: TopNavAction[];
  rightSlot?: ReactNode;
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

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase();
}

function BrandContent({ brand }: { brand: TopNavBrand }) {
  return (
    <>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
        <span className="text-lg font-bold text-white">
          {brand.initial ?? getInitial(brand.name)}
        </span>
      </div>
      <span className="text-lg font-semibold text-gray-900">{brand.name}</span>
    </>
  );
}

function TopNavActionItem({
  action,
  onAction,
  className,
}: {
  action: TopNavAction;
  onAction?: TopNavProps['onAction'];
  className?: string;
}) {
  const Icon = action.icon;
  const actionClassName = cn(
    'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm  text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900',
    className
  );

  if (action.href) {
    return (
      <a
        href={action.href}
        title={action.title ?? action.label}
        aria-label={action.ariaLabel ?? action.label}
        className={actionClassName}
        onClick={(event) => onAction?.(action, event)}
      >
        <Icon className="h-4 w-4" />
        <span>{action.label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      title={action.title ?? action.label}
      aria-label={action.ariaLabel ?? action.label}
      className={actionClassName}
      onClick={(event) => onAction?.(action, event)}
    >
      <Icon className="h-4 w-4" />
      <span>{action.label}</span>
    </button>
  );
}

export function TopNav({
  brand,
  items,
  inlineActions,
  rightSlot,
  user,
  menuActions = [],
  onNavigate,
  onAction,
  className,
  containerClassName,
}: TopNavProps) {
  return (
    <nav
      className={cn(
        className,
        'fixed top-0 left-0 right-0 z-50 w-full border-b border-gray-200 shadow bg-white!'
      )}
    >
      <div
        className={cn(
          'mx-auto flex h-14 items-center justify-between gap-4 px-6 sm:px-8 lg:px-10',
          containerClassName,
        )}
      >
        {/* 左侧：标识和名称 */}
        <div className="flex min-w-0 items-center gap-10 lg:gap-14">
          {brand.href ? (
            <a
              href={brand.href}
              aria-label={brand.ariaLabel ?? brand.name}
              className="flex items-center gap-2"
            >
              <BrandContent brand={brand} />
            </a>
          ) : (
            <div className="flex items-center gap-2">
              <BrandContent brand={brand} />
            </div>
          )}

          {/* 导航菜单 */}
          <div className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm  transition-colors',
                  item.active || item.highlighted
                    ? 'text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                )}
                aria-current={item.active ? 'page' : undefined}
                onClick={(event) => onNavigate?.(item, event)}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        {/* 右侧：图标和头像 */}
        <div className="flex items-center gap-3">
          {inlineActions.map((action) => (
            <TopNavActionItem
              key={action.id}
              action={action}
              onAction={onAction}
            />
          ))}

          {rightSlot}

          {/* 用户头像 */}
          {user ? (
            <ProfileDropdown
              user={user}
              actions={menuActions}
              onAction={onAction}
            />
          ) : null}
        </div>
      </div>
    </nav>
  );
}
