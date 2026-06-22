import React from 'react';

// FIX: Extend React.HTMLAttributes<HTMLDivElement> to allow passing standard div props like onClick.
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    // FIX: Spread remaining props to the underlying div element.
    <div className={`bg-surface border border-border rounded-lg shadow-lg p-6 ${className}`} {...props}>
      {children}
    </div>
  );
};
