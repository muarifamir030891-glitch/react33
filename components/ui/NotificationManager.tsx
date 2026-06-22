import React, { createContext, useContext, useState, useCallback, ReactNode, FC, useEffect } from 'react';

// --- TYPES ---
type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  id: number;
  message: ReactNode;
  type: NotificationType;
}

interface NotificationContextType {
  addNotification: (message: ReactNode, type?: NotificationType, duration?: number) => void;
}

// --- ICONS ---
const SuccessIcon: FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ErrorIcon: FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const InfoIcon: FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;

const ICONS: Record<NotificationType, FC> = { success: SuccessIcon, error: ErrorIcon, info: InfoIcon };
const BORDER_COLORS: Record<NotificationType, string> = { success: 'border-green-500', error: 'border-red-500', info: 'border-blue-500' };

// --- CONTEXT & PROVIDER ---
interface FullNotificationContext extends NotificationContextType {
  notifications: Notification[];
  removeNotification: (id: number) => void;
}
const NotificationContext = createContext<FullNotificationContext | undefined>(undefined);

export const NotificationProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((message: ReactNode, type: NotificationType = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    if (duration > 0) {
        setTimeout(() => {
          removeNotification(id);
        }, duration);
    }
  }, [removeNotification]);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return { addNotification: context.addNotification };
};


// --- UI COMPONENTS ---
const NotificationToast: FC<{ notification: Notification; onDismiss: (id: number) => void }> = ({ notification, onDismiss }) => {
  const Icon = ICONS[notification.type];
  const borderColor = BORDER_COLORS[notification.type];

  return (
    <div
      className={`notification-toast flex items-start w-full max-w-sm p-4 bg-surface rounded-lg shadow-xl border-l-4 ${borderColor} my-2`}
      role="alert"
    >
      <div className="flex-shrink-0 pt-0.5"><Icon /></div>
      <div className="ml-3 text-sm font-normal text-text-primary whitespace-pre-wrap flex-1">{notification.message}</div>
      <button
        type="button"
        className="ml-auto -mx-1.5 -my-1.5 bg-surface text-text-secondary hover:text-text-primary rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-background inline-flex h-8 w-8"
        aria-label="Close"
        onClick={() => onDismiss(notification.id)}
      >
        <span className="sr-only">Close</span>
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
      </button>
    </div>
  );
};


export const NotificationContainer: FC = () => {
    const context = useContext(NotificationContext);
    if (!context) return null; // Should not happen if placed correctly
    const { notifications, removeNotification } = context;

    return (
        <div className="fixed top-4 right-4 z-[100] w-full max-w-sm space-y-2 no-print">
            {notifications.map(n => (
                <NotificationToast key={n.id} notification={n} onDismiss={removeNotification} />
            ))}
        </div>
    );
};