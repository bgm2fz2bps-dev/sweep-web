import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import NamePrompt from './components/NamePrompt';
import Home from './pages/Home';
import CreateSweep from './pages/CreateSweep';
import SweepDetail from './pages/SweepDetail';
import JoinSweep from './pages/JoinSweep';

function NavBar() {
  const [displayName, setDisplayName] = useState(localStorage.getItem('sweepDisplayName'));

  useEffect(() => {
    const handler = () => setDisplayName(localStorage.getItem('sweepDisplayName'));
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <nav className="nav">
      <a href="/" className="nav-logo">
        Sweep<span style={{ color: 'var(--white)' }}>.</span>
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {displayName && (
          <span style={{ color: 'var(--muted-light)', fontSize: '0.875rem' }}>
            G&apos;day, <strong style={{ color: 'var(--yellow)' }}>{displayName}</strong>
          </span>
        )}
        <Link to="/my-sweeps" style={{ color: 'var(--muted-light)', fontSize: '0.875rem', textDecoration: 'none' }}>
          My sweeps
        </Link>
        <Link to="/create" className="btn btn-primary btn-sm">
          + Create
        </Link>
      </div>
    </nav>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          // Every Firestore write is checked against the auth UID, so the app
          // can't work signed out. Say so instead of failing on every click.
          console.error('Anonymous auth failed:', err);
          setAuthError(true);
        }
      }
      setAuthReady(true);

      const savedName = localStorage.getItem('sweepDisplayName');
      if (!savedName) {
        setShowNamePrompt(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleNameSave = () => {
    setShowNamePrompt(false);
    window.dispatchEvent(new Event('storage'));
  };

  if (!authReady) {
    return (
      <div className="loading-state" style={{ minHeight: '100vh' }}>
        <div className="loading-spinner" />
        <span>Getting the horses ready...</span>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="loading-state" style={{ minHeight: '100vh', textAlign: 'center', padding: '24px' }}>
        <span style={{ fontSize: '2rem' }}>🐎💨</span>
        <span>Couldn&apos;t connect. Check your connection (or private-browsing settings) and refresh.</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {showNamePrompt && <NamePrompt onSave={handleNameSave} />}
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/my-sweeps" element={<Home />} />
        <Route path="/create" element={<CreateSweep />} />
        <Route path="/sweep/:sweepId" element={<SweepDetail />} />
        <Route path="/join/:code" element={<JoinSweep />} />
        <Route path="/join" element={<JoinSweep />} />
      </Routes>
    </BrowserRouter>
  );
}
