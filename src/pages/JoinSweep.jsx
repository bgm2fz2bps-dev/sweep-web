import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { saveSweepLocally } from '../identity';

export default function JoinSweep() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorMsg('No join code provided.');
      return;
    }
    resolveCode(code.toUpperCase());
  }, [code]);

  const resolveCode = async (joinCode) => {
    try {
      const q = query(collection(db, 'sweeps'), where('joinCode', '==', joinCode));
      const snap = await getDocs(q);

      if (snap.empty) {
        setStatus('error');
        setErrorMsg(`Couldn't find a sweep with code "${joinCode}". Double-check the code, mate.`);
        return;
      }

      const sweepId = snap.docs[0].id;
      saveSweepLocally(sweepId);
      navigate(`/sweep/${sweepId}`, { replace: true });
    } catch (err) {
      console.error('Join sweep failed:', err);
      setStatus('error');
      setErrorMsg('Something went wrong. Give it another crack.');
    }
  };

  if (status === 'loading') {
    return (
      <div className="loading-state" style={{ minHeight: '60vh' }}>
        <div className="loading-spinner" />
        <span>Finding sweep &quot;{code}&quot;...</span>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: '480px', textAlign: 'center', paddingTop: '80px' }}>
      <div style={{ fontSize: '4rem', marginBottom: '16px' }}>😬</div>
      <h2 style={{ marginBottom: '12px' }}>Couldn&apos;t join</h2>
      <p style={{ color: 'var(--muted-light)', marginBottom: '32px' }}>{errorMsg}</p>
      <Link to="/" className="btn btn-secondary">
        Back to Home
      </Link>
    </div>
  );
}
