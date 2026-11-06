import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { LiveEvents, ToastProvider } from './components/Toasts';
import { isSearchShortcut, useHotkeys } from './lib/hotkeys';
import { useTheme } from './lib/theme';
import Home from './pages/Home';
import LabList from './pages/LabList';
import LabViewer from './pages/LabViewer';
import Settings from './pages/Settings';
import Practice from './pages/Practice';
import Search from './pages/Search';

export default function App() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  useHotkeys((e) => {
    if (!isSearchShortcut(e)) return;
    e.preventDefault();
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    } else {
      navigate('/search');
    }
  });
  return (
    <ToastProvider>
      <LiveEvents />
      <header className="topbar">
        <strong className="brand">Lab Dashboard</strong>
        <nav aria-label="Main">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/labs">Labs</NavLink>
          <NavLink to="/practice">Practice</NavLink>
          <NavLink to="/search" aria-keyshortcuts="Control+K Meta+K">
            Search <kbd>Ctrl K</kbd>
          </NavLink>
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
          <Route path="/practice" element={<Practice />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </ToastProvider>
  );
}
