import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { saveSweepLocally } from '../identity';

export default function JoinSweep() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  // /join/CODE, or /join?code=CODE from the no-JS form on the static pages
  const code = params.code || searchParams.get('code') || '';
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
      if (!/^[A-Z0-9]{4,8}$/.test(joinCode)) {
        setStatus('error');
        setErrorMsg(`"${joinCode}" doesn't look like a join code. Double-check it, mate.`);
        return;
      }
      const snap = await getDoc(doc(db, 'joinCodes', joinCode));

      if (!snap.exists()) {
        setStatus('error');
        setErrorMsg(`Couldn't find a sweep with code "${joinCode}". Double-check the code, mate.`);
        return;
      }

      const { sweepId } = snap.data();
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
