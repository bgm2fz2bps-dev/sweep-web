import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getSessionId } from '../identity';

function StatusBadge({ status }) {
  const map = {
    open: { label: 'Open', cls: 'status-open' },
    drawn: { label: 'Drawn', cls: 'status-drawn' },
    racing: { label: 'Race Day', cls: 'status-racing' },
    completed: { label: 'Completed', cls: 'status-completed' },
  };
  const s = map[status] || { label: status, cls: 'status-open' };
  return <span className={`status-badge ${s.cls}`}>{s.label}</span>;
}

export default function Home() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [mySweeps, setMySweeps] = useState([]);
  const [joinedSweeps, setJoinedSweeps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = getSessionId();

    // Listen to sweeps created by this user
    const createdQ = query(
      collection(db, 'sweeps'),
      where('creatorId', '==', uid)
    );
    const unsub1 = onSnapshot(createdQ, (snap) => {
      const sweeps = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      sweeps.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMySweeps(sweeps);
      setLoading(false);
    }, () => setLoading(false));

    // Listen to sweeps where user has joined as participant (not creator)
    const joinedQ = query(
      collection(db, 'sweeps'),
      where('participantIds', 'array-contains', uid)
    );
    const unsub2 = onSnapshot(joinedQ, (snap) => {
      const sweeps = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.creatorId !== uid);
      setJoinedSweeps(sweeps);
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    navigate(`/join/${code}`);
  };

  return (
    <div className="page">
      {/* Hero */}
      <div className="hero">
        <span className="hero-emoji">🏆</span>
        <h1>
          Run your <span className="hero-yellow">sweep</span><br />
          like a ripper
        </h1>
        <p className="hero-tagline">
          The classic Aussie sweepstakes, now digital. Create a sweep, invite your mates, draw horses, crown the winner.
        </p>
        <div style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/create" className="btn btn-primary btn-lg">
            🎲 Create a Sweep
          </Link>
        </div>
      </div>

      <div className="divider" />

      {/* Join Form */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <h3 style={{ marginBottom: '4px' }}>Got a code?</h3>
        <p style={{ color: 'var(--muted-light)', fontSize: '0.9rem', marginBottom: '16px' }}>
          Someone sent you a join code? Enter it here to jump in.
        </p>
        <form onSubmit={handleJoin} style={{ display: 'flex', gap: '10px' }}>
          <input
            className="input input-lg"
            style={{ flex: 1, textAlign: 'left', fontSize: '1rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}
            type="text"
            placeholder="ABC123"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={8}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={joinCode.trim().length < 4}
          >
            Join →
          </button>
        </form>
      </div>

      {/* My Sweeps */}
      {loading ? (
        <div className="loading-state"><div className="loading-spinner" /></div>
      ) : (
        <>
          {mySweeps.length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <p className="section-title">My Sweeps</p>
              <div className="entry-list">
                {mySweeps.map(sweep => (
                  <Link key={sweep.id} to={`/sweep/${sweep.id}`} className="card card-link" style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--white)', marginBottom: '4px' }}>{sweep.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted-light)' }}>
                          {sweep.race} &middot; Code: <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>{sweep.joinCode}</span>
                        </div>
                      </div>
                      <StatusBadge status={sweep.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {joinedSweeps.length > 0 && (
            <section>
              <p className="section-title">Sweeps I&apos;ve Joined</p>
              <div className="entry-list">
                {joinedSweeps.map(sweep => (
                  <Link key={sweep.id} to={`/sweep/${sweep.id}`} className="card card-link" style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--white)', marginBottom: '4px' }}>{sweep.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted-light)' }}>{sweep.race}</div>
                      </div>
                      <StatusBadge status={sweep.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {mySweeps.length === 0 && joinedSweeps.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🎠</div>
              <p style={{ fontWeight: 600, color: 'var(--muted-light)', marginBottom: '8px' }}>
                No sweeps yet
              </p>
              <p style={{ fontSize: '0.875rem' }}>
                Create one or ask your mate for the join code.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
