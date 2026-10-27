import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SuperAdminDashboard />} />
      </Routes>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-bg-card)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.875rem',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#0f172a' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#0f172a' },
          },
        }}
      />
    </BrowserRouter>
  );
}
