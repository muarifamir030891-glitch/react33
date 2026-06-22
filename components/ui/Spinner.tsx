
import React from 'react';

export const Spinner: React.FC<{ className?: string, size?: 'sm' | 'md' | 'lg' }> = ({ className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-5 w-5 border-2',
    lg: 'h-8 w-8 border-4'
  };
  
  return (
    <div className={`animate-spin rounded-full ${sizeClasses[size]} border-b-primary border-t-transparent ${className}`}></div>
  );
};
