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
      <Link to="/" className="nav-logo">
        Sweep<span style={{ color: 'var(--white)' }}>.</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {displayName && (
          <span style={{ color: 'var(--muted-light)', fontSize: '0.875rem' }}>
            G&apos;day, <strong style={{ color: 'var(--yellow)' }}>{displayName}</strong>
          </span>
        )}
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error('Anonymous auth failed:', err);
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

  return (
    <BrowserRouter>
      {showNamePrompt && <NamePrompt onSave={handleNameSave} />}
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateSweep />} />
        <Route path="/sweep/:sweepId" element={<SweepDetail />} />
        <Route path="/join/:code" element={<JoinSweep />} />
      </Routes>
    </BrowserRouter>
  );
}
