import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAdornment?: React.ReactNode;
  rightAdornment?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftAdornment,
  rightAdornment,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
          {label}
        </label>
      )}
      <div className="relative rounded-md shadow-xs">
        {leftAdornment && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 text-sm">
            {leftAdornment}
          </div>
        )}
        <input
          id={inputId}
          className={`block w-full rounded-md border border-slate-300 bg-white py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800 min-h-[44px] ${
            leftAdornment ? 'pl-9' : 'pl-3'
          } ${rightAdornment ? 'pr-9' : 'pr-3'} ${
            error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : ''
          } ${className}`}
          {...props}
        />
        {rightAdornment && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 text-sm">
            {rightAdornment}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
};
