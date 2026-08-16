import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './components/ui/NotificationManager';
import { SerialTimingProvider } from './contexts/SerialTimingContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);

// For React 19, StrictMode is the default in development.
// This simplified render call is more idiomatic and robust.
root.render(
  <ThemeProvider>
    <NotificationProvider>
      <SerialTimingProvider>
        <App />
      </SerialTimingProvider>
    </NotificationProvider>
  </ThemeProvider>
);