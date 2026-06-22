
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  className?: string;
}

export const Input: React.FC<InputProps> = ({ label, id, className, ...props }) => {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-text-secondary mb-1">
        {label}
      </label>
      <input
        id={id}
        className="w-full bg-background border border-border rounded-md px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
        {...props}
      />
    </div>
  );
};