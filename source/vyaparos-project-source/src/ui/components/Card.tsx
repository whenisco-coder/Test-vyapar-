import React from 'react';

interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
}) => {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-50/60">
          <div>
            {title && <h3 className="text-sm sm:text-base font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
};

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'slate' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'blue';
  className?: string;
}> = ({ children, variant = 'slate', className = '' }) => {
  const variantStyles = {
    slate: 'bg-slate-100 text-slate-800 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold select-none ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
