import { NavLink, Route, Routes } from 'react-router-dom';
import { LiveEvents, ToastProvider } from './components/Toasts';
import { useTheme } from './lib/theme';
import Home from './pages/Home';
import LabList from './pages/LabList';
import LabViewer from './pages/LabViewer';
import Settings from './pages/Settings';

export default function App() {
  const { theme, toggle } = useTheme();
  return (
    <ToastProvider>
      <LiveEvents />
      <header className="topbar">
        <strong className="brand">Lab Dashboard</strong>
        <nav aria-label="Main">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/labs">Labs</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button type="button" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/labs" element={<LabList />} />
          <Route path="/labs/:slug" element={<LabViewer />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </ToastProvider>
  );
}
