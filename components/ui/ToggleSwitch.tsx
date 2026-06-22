
import React from 'react';

interface ToggleSwitchProps {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  enabledText?: string;
  disabledText?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, enabled, onChange, enabledText = 'ON', disabledText = 'OFF' }) => {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-text-primary">{label}</span>
      <div className="flex items-center">
         <span className={`mr-3 text-sm font-bold ${enabled ? 'text-primary' : 'text-text-secondary'}`}>
            {enabled ? enabledText : disabledText}
        </span>
        <button
            type="button"
            className={`${
            enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2`}
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange(!enabled)}
        >
            <span
            aria-hidden="true"
            className={`${
                enabled ? 'translate-x-5' : 'translate-x-0'
            } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
        </button>
      </div>
    </div>
  );
};
