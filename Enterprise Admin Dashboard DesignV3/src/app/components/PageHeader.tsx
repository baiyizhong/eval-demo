import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}

export function PageHeader({ title, description, actions, badge }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between px-6 py-5 bg-white border-b border-slate-200">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-slate-900">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-slate-500 text-sm mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
