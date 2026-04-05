import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  doc, onSnapshot, collection, updateDoc, writeBatch,
  getDocs, addDoc, serverTimestamp, query, orderBy, arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';
import { getSessionId } from '../identity';
import { MELBOURNE_CUP_HORSES } from '../data/horses';
import { fetchRaceDetail, getFinisherRunnerNumber, runnerByNumber } from '../tabApi';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function StatusBadge({ status }) {
  const map = {
    open: { label: '🟢 Open', cls: 'status-open' },
    drawn: { label: '🎲 Drawn', cls: 'status-drawn' },
    racing: { label: '🏇 Race Day', cls: 'status-racing' },
    completed: { label: '🏆 Completed', cls: 'status-completed' },
  };
  const s = map[status] || { label: status, cls: 'status-open' };
  return <span className={`status-badge ${s.cls}`}>{s.label}</span>;
}

/** Returns true if the sweep has TAB fields set. */
function hasTAB(sweep) {
  return !!(sweep?.tabVenueMnemonic && sweep?.tabRaceNumber && sweep?.tabDate && sweep?.tabRaceType);
}

function Countdown({ targetIso }) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    function tick() {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setDisplay('Race underway 🏇');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) {
        setDisplay(`${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`);
      } else {
        setDisplay(`${m}m ${String(s).padStart(2,'0')}s`);
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return (
    <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
        Race starts in
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--yellow)', fontVariantNumeric: 'tabular-nums' }}>
        {display}
      </div>
    </div>
  );
}

// ─── Lobby (open) ────────────────────────────────────────────────────────────

function LobbyView({ sweep, sweepId, entries, currentUid }) {
  const [copying, setCopying] = useState(false);
  const [drawLoading, setDrawLoading] = useState(false);
  const [drawError, setDrawError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  const isCreator = currentUid === sweep.creatorId;
  const isParticipant = entries.some(e => e.userId === currentUid);
  const joinUrl = `${window.location.origin}/join/${sweep.joinCode}`;

  const joinSweep = async () => {
    setJoinError('');
    setJoinLoading(true);
    try {
      const currentCount = entries.length;
      if (currentCount >= (sweep.maxEntries || 24)) {
        setJoinError("She's chockers! No spots left.");
        return;
      }
      const currentUserEntries = entries.filter(e => e.userId === currentUid).length;
      const maxPerPerson = sweep.maxEntriesPerPerson || 1;
      if (currentUserEntries >= maxPerPerson) {
        setJoinError(`You can only claim up to ${maxPerPerson} spot${maxPerPerson !== 1 ? 's' : ''}.`);
        return;
      }
      const displayName = localStorage.getItem('sweepDisplayName') || 'Anonymous';
      await addDoc(collection(db, 'sweeps', sweepId, 'entries'), {
        userId: currentUid,
        displayName,
        horseId: null,
        horseName: null,
        joinedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'sweeps', sweepId), {
        participantIds: arrayUnion(currentUid),
      });
    } catch (err) {
      console.error('Join failed:', err);
      setJoinError('Something went wrong. Give it another crack.');
    } finally {
      setJoinLoading(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    } catch {
      window.prompt('Copy this link:', joinUrl);
    }
  };

  const startDraw = async () => {
    if (entries.length < 2) return;
    setDrawError('');
    setDrawLoading(true);
    try {
      let horseList;

      if (hasTAB(sweep)) {
        // Fetch live runner list from TAB
        const detail = await fetchRaceDetail(
          sweep.tabDate,
          sweep.tabRaceType,
          sweep.tabVenueMnemonic,
          sweep.tabRaceNumber
        );
        horseList = detail.runners.map(r => ({
          id: r.runnerNumber,
          name: `${r.runnerNumber}. ${r.runnerName}${r.barrierNumber ? ` (B${r.barrierNumber})` : ''}`,
        }));
      } else {
        horseList = MELBOURNE_CUP_HORSES;
      }

      const shuffled = fisherYates(horseList);
      const batch = writeBatch(db);

      entries.forEach((entry, i) => {
        const horse = shuffled[i % shuffled.length];
        const entryRef = doc(db, 'sweeps', sweepId, 'entries', entry.id);
        batch.update(entryRef, {
          horseId: horse.id,
          horseName: horse.name,
        });
      });

      const sweepRef = doc(db, 'sweeps', sweepId);
      batch.update(sweepRef, { status: 'drawn', drawnAt: serverTimestamp() });

      await batch.commit();
    } catch (err) {
      console.error('Draw failed:', err);
      setDrawError('The draw failed. Give it another crack!');
    } finally {
      setDrawLoading(false);
    }
  };

  return (
    <div>
      {/* Sweep info */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ marginBottom: '6px' }}>{sweep.name}</h2>
            <p style={{ color: 'var(--muted-light)', fontSize: '0.9rem' }}>{sweep.race}</p>
          </div>
          <StatusBadge status={sweep.status} />
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {sweep.entryFee && (
            <div style={{ fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--muted)' }}>Entry: </span>
              <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>{sweep.entryFee}</span>
            </div>
          )}
          <div style={{ fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--muted)' }}>Spots: </span>
            <span style={{ color: 'var(--white)', fontWeight: 700 }}>{entries.length} / {sweep.maxEntries || 24}</span>
          </div>
          {(sweep.maxEntriesPerPerson || 1) > 1 && (
            <div style={{ fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--muted)' }}>Per person: </span>
              <span style={{ color: 'var(--white)', fontWeight: 700 }}>max {sweep.maxEntriesPerPerson}</span>
            </div>
          )}
          {hasTAB(sweep) && (
            <div style={{ fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>🏇 TAB Linked</span>
              <span style={{ color: 'var(--muted)' }}> — {sweep.tabMeetingName} R{sweep.tabRaceNumber}</span>
            </div>
          )}
        </div>
      </div>

      {/* Join code */}
      <div className="join-code-box" style={{ marginBottom: '20px' }}>
        <p className="join-code-label">Join Code</p>
        <div className="join-code">{sweep.joinCode}</div>
        <p className="join-code-sub">Share this code or the link below</p>
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginTop: '14px' }}
          onClick={copyLink}
        >
          {copying ? '✓ Copied!' : '📋 Copy invite link'}
        </button>
      </div>

      {/* Entries */}
      <div style={{ marginBottom: '24px' }}>
        <p className="section-title">
          Who&apos;s In ({entries.length})
        </p>
        {entries.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px' }}>
            <p style={{ color: 'var(--muted)' }}>No one&apos;s joined yet. Share the code!</p>
          </div>
        ) : (
          <div className="entry-list">
            {entries.map(entry => (
              <div
                key={entry.id}
                className={`entry-row ${entry.userId === currentUid ? 'is-me' : ''}`}
              >
                <div className="entry-avatar">{getInitials(entry.displayName)}</div>
                <span className="entry-name">{entry.displayName}</span>
                {entry.userId === currentUid && (
                  <span className="entry-badge">You</span>
                )}
                {entry.userId === sweep.creatorId && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>host</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Draw button */}
      {isCreator && (
        <div>
          {drawError && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{drawError}</div>}
          {entries.length < 2 ? (
            <div className="alert alert-info">
              You need at least 2 entries before you can start the draw.
            </div>
          ) : (
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={startDraw}
              disabled={drawLoading}
            >
              {drawLoading
                ? (hasTAB(sweep) ? 'Fetching runners from TAB...' : 'Running the draw...')
                : `🎲 Start the Draw (${entries.length} entries)`}
            </button>
          )}
        </div>
      )}

      {!isCreator && !isParticipant && (
        <div>
          {joinError && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{joinError}</div>}
          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={joinSweep}
            disabled={joinLoading}
          >
            {joinLoading ? 'Joining...' : '🙋 Join this Sweep'}
          </button>
        </div>
      )}

      {!isCreator && isParticipant && (
        <div className="alert alert-info">
          Waiting for the host to start the draw...
        </div>
      )}
    </div>
  );
}

// ─── Draw Reveal (drawn) ─────────────────────────────────────────────────────

function DrawReveal({ sweep, sweepId, entries, currentUid }) {
  const [advancing, setAdvancing] = useState(false);

  const isCreator = currentUid === sweep.creatorId;

  const goToRaceDay = async () => {
    setAdvancing(true);
    try {
      await updateDoc(doc(db, 'sweeps', sweepId), { status: 'racing' });
    } catch (err) {
      console.error(err);
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
        <span style={{ fontSize: '3rem', display: 'block', marginBottom: '12px' }}>🎲</span>
        <h2>{sweep.name}</h2>
        <p style={{ color: 'var(--muted-light)', marginTop: '6px' }}>The horses have been drawn! Here&apos;s who got what.</p>
      </div>

      <div className="entry-list" style={{ marginBottom: '32px' }}>
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className={`entry-row reveal-entry ${entry.userId === currentUid ? 'is-me' : ''}`}
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="entry-avatar">{getInitials(entry.displayName)}</div>
            <div style={{ flex: 1 }}>
              <div className="entry-name">{entry.displayName}</div>
              {entry.horseName && (
                <div style={{ fontSize: '0.8rem', color: entry.userId === currentUid ? 'var(--yellow)' : 'var(--muted-light)', fontWeight: 600, marginTop: '2px' }}>
                  🐴 {entry.horseName}
                </div>
              )}
            </div>
            {entry.userId === currentUid && <span className="entry-badge">You</span>}
          </div>
        ))}
      </div>

      {isCreator && (
        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={goToRaceDay}
          disabled={advancing}
        >
          {advancing ? 'Loading...' : '🏇 View Race Day →'}
        </button>
      )}

      {!isCreator && (
        <div className="alert alert-info">
          Waiting for host to open Race Day view...
        </div>
      )}
    </div>
  );
}

// ─── Race Day (racing) ───────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;
// Only save results once protests are resolved and result is truly final
const RESULTED_STATUSES = new Set(['Resulted']);

const TAB_STATUS_LABEL = {
  Normal: 'Not yet started',
  Open: 'Open for betting',
  Closed: 'Closed — race imminent',
  Interim: 'Interim — awaiting protest resolution',
  Paying: 'Paying out — awaiting final result',
  Resulted: 'Final result',
  Abandoned: 'Abandoned',
};

function RaceDayView({ sweep, sweepId, entries, currentUid }) {
  const [showResultsForm, setShowResultsForm] = useState(false);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [third, setThird] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // TAB auto-results polling
  const [pollStatus, setPollStatus] = useState('');   // human-readable status string
  const [autoResultError, setAutoResultError] = useState('');
  const [raceStartTime, setRaceStartTime] = useState(null);
  const pollTimerRef = useRef(null);
  const isSavingRef = useRef(false);

  const isCreator = currentUid === sweep.creatorId;
  const tabEnabled = hasTAB(sweep);

  // Build horse list from entries (for manual results form when no TAB)
  // For TAB sweeps the horse names are stored on entries (e.g. "1. Thunder (B3)")
  const allHorses = entries
    .filter(e => e.horseId != null)
    .map(e => ({ id: e.horseId, name: e.horseName }))
    .sort((a, b) => a.id - b.id);

  // Fallback to MELBOURNE_CUP_HORSES for non-TAB sweeps
  const horseListForForm = tabEnabled ? allHorses : MELBOURNE_CUP_HORSES;

  const saveAutoResults = async (raceDetail) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      const winnerNum = getFinisherRunnerNumber(raceDetail, 0);
      const secondNum = getFinisherRunnerNumber(raceDetail, 1);
      const thirdNum = getFinisherRunnerNumber(raceDetail, 2);

      const winnerRunner = runnerByNumber(raceDetail.runners, winnerNum);
      const secondRunner = runnerByNumber(raceDetail.runners, secondNum);
      const thirdRunner = runnerByNumber(raceDetail.runners, thirdNum);

      // Match runner numbers back to entry horseIds
      const entryByHorseId = {};
      entries.forEach(e => { if (e.horseId != null) entryByHorseId[e.horseId] = e; });

      const firstEntry = winnerNum != null ? entryByHorseId[winnerNum] : null;
      const secondEntry = secondNum != null ? entryByHorseId[secondNum] : null;
      const thirdEntry = thirdNum != null ? entryByHorseId[thirdNum] : null;

      await addDoc(collection(db, 'sweeps', sweepId, 'results'), {
        firstHorseId: winnerNum ?? null,
        firstHorseName: winnerRunner ? `${winnerRunner.runnerNumber}. ${winnerRunner.runnerName}` : (winnerNum ? String(winnerNum) : null),
        secondHorseId: secondNum ?? null,
        secondHorseName: secondRunner ? `${secondRunner.runnerNumber}. ${secondRunner.runnerName}` : (secondNum ? String(secondNum) : null),
        thirdHorseId: thirdNum ?? null,
        thirdHorseName: thirdRunner ? `${thirdRunner.runnerNumber}. ${thirdRunner.runnerName}` : (thirdNum ? String(thirdNum) : null),
        autoRecorded: true,
        recordedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'sweeps', sweepId), { status: 'completed' });
    } catch (err) {
      console.error('Auto-save results failed:', err);
      setAutoResultError('Auto-save failed. Enter results manually below.');
      isSavingRef.current = false;
    }
  };

  const poll = useCallback(async () => {
    if (!tabEnabled || isSavingRef.current) return;
    try {
      const detail = await fetchRaceDetail(
        sweep.tabDate,
        sweep.tabRaceType,
        sweep.tabVenueMnemonic,
        sweep.tabRaceNumber
      );
      setPollStatus(detail.raceStatus || 'Unknown');
      if (detail.raceStartTime && !raceStartTime) setRaceStartTime(detail.raceStartTime);

      if (RESULTED_STATUSES.has(detail.raceStatus)) {
        // Race is done — save results and transition
        clearInterval(pollTimerRef.current);
        await saveAutoResults(detail);
      }
    } catch (err) {
      console.error('Poll error:', err);
      // Don't show error on every failed poll — just keep trying
    }
  }, [sweep, sweepId, tabEnabled, entries]);

  useEffect(() => {
    if (!tabEnabled) return;
    // Start polling immediately, then every 30s
    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollTimerRef.current);
  }, [tabEnabled, poll]);

  // Build a map: horseId -> entry (for the grid display)
  const horseToEntry = {};
  entries.forEach(e => {
    if (e.horseId) horseToEntry[e.horseId] = e;
  });

  // For TAB sweeps: build horse display list from entries rather than hardcoded list
  const displayHorses = tabEnabled
    ? entries
        .filter(e => e.horseId != null)
        .map(e => ({ id: e.horseId, name: e.horseName, entry: e }))
        .sort((a, b) => a.id - b.id)
    : MELBOURNE_CUP_HORSES.map(horse => ({
        ...horse,
        entry: horseToEntry[horse.id] || null,
      }));

  const submitResults = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!first) { setFormError('Enter the 1st place horse.'); return; }

    setSubmitting(true);
    try {
      const firstHorse = horseListForForm.find(h => h.name === first);
      const secondHorse = horseListForForm.find(h => h.name === second);
      const thirdHorse = horseListForForm.find(h => h.name === third);

      await addDoc(collection(db, 'sweeps', sweepId, 'results'), {
        firstHorseId: firstHorse?.id || null,
        firstHorseName: first,
        secondHorseId: secondHorse?.id || null,
        secondHorseName: second || null,
        thirdHorseId: thirdHorse?.id || null,
        thirdHorseName: third || null,
        autoRecorded: false,
        recordedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'sweeps', sweepId), { status: 'completed' });
    } catch (err) {
      console.error('Submit results failed:', err);
      setFormError('Failed to save results. Try again.');
      setSubmitting(false);
    }
  };

  const myEntry = entries.find(e => e.userId === currentUid);

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '24px 0 20px' }}>
        <span style={{ fontSize: '3rem', display: 'block', marginBottom: '10px' }}>🏇</span>
        <h2>{sweep.name}</h2>
        <p style={{ color: 'var(--muted-light)', marginTop: '4px' }}>{sweep.race} — Race Day!</p>
      </div>

      {/* TAB polling status */}
      {tabEnabled && (
        <div className="alert alert-info" style={{ marginBottom: '20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.2rem' }}>⏳</span>
          <div>
            <strong>Waiting for race results...</strong>
            {pollStatus && <> Race status: <strong>{TAB_STATUS_LABEL[pollStatus] ?? pollStatus}</strong>.</>}
            {' '}Polling TAB every 30 seconds.
            {autoResultError && <div style={{ color: 'var(--error)', marginTop: '4px' }}>{autoResultError}</div>}
          </div>
        </div>
      )}

      {myEntry?.horseName && (
        <div className="card card-highlighted" style={{ marginBottom: '20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted-light)', fontSize: '0.85rem', marginBottom: '4px' }}>Your horse</p>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--yellow)' }}>
            🐴 {myEntry.horseName}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '4px' }}>
            {tabEnabled ? `Runner #${myEntry.horseId}` : `Horse #${myEntry.horseId}`}
          </p>
        </div>
      )}

      <p className="section-title">All {tabEnabled ? 'Runners' : 'Horses'}</p>
      <div className="horse-grid" style={{ marginBottom: '32px' }}>
        {displayHorses.map(horse => {
          const entry = tabEnabled ? horse.entry : horse.entry;
          const isMe = entry?.userId === currentUid;
          const hasOwner = !!entry;
          return (
            <div
              key={horse.id}
              className={`horse-card ${isMe ? 'my-horse' : ''}`}
              style={{ opacity: hasOwner ? 1 : 0.45 }}
            >
              <div className="horse-number">#{horse.id}</div>
              <div className="horse-name">{horse.name}</div>
              {entry ? (
                <div className={`horse-owner ${isMe ? 'mine' : ''}`}>
                  {isMe ? '⭐ ' : ''}{entry.displayName}
                </div>
              ) : (
                <div className="horse-owner" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Undrawn</div>
              )}
            </div>
          );
        })}
      </div>

      {isCreator && !showResultsForm && (() => {
        // For non-TAB sweeps: always show
        if (!tabEnabled) return true;
        // For TAB sweeps: show only after 2h past race start (gives TAB time to result)
        // No requirement for autoResultError — page may not have been open when race finished
        if (!raceStartTime) return false;
        const twoHoursAfterStart = new Date(raceStartTime).getTime() + 2 * 60 * 60 * 1000;
        return Date.now() > twoHoursAfterStart;
      })() && (
        <button
          className="btn btn-primary btn-full btn-lg"
          onClick={() => setShowResultsForm(true)}
        >
          🏆 Enter Race Results Manually
        </button>
      )}

      {isCreator && showResultsForm && (
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Enter Results</h3>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={submitResults}>
            {[
              { label: '🥇 1st Place', value: first, setter: setFirst, required: true },
              { label: '🥈 2nd Place', value: second, setter: setSecond, required: false },
              { label: '🥉 3rd Place', value: third, setter: setThird, required: false },
            ].map(({ label, value, setter, required }) => (
              <div className="form-group" key={label}>
                <label className="form-label">{label}</label>
                <select
                  className="input"
                  value={value}
                  onChange={e => setter(e.target.value)}
                  required={required}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Select a {tabEnabled ? 'runner' : 'horse'}...</option>
                  {horseListForForm.map(h => (
                    <option key={h.id} value={h.name}>{h.name}</option>
                  ))}
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                {submitting ? 'Saving...' : '✓ Save Results'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowResultsForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Results (completed) ─────────────────────────────────────────────────────

function ResultsView({ sweep, sweepId, entries, currentUid }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resultsRef = collection(db, 'sweeps', sweepId, 'results');
    const q = query(resultsRef, orderBy('recordedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setResults({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
      setLoading(false);
    });
    return () => unsub();
  }, [sweepId]);

  if (loading) {
    return <div className="loading-state"><div className="loading-spinner" /></div>;
  }

  const horseToEntry = {};
  entries.forEach(e => { if (e.horseId) horseToEntry[e.horseId] = e; });

  const places = results ? [
    { emoji: '🥇', label: '1st Place', horseName: results.firstHorseName, horseId: results.firstHorseId, cls: 'first' },
    { emoji: '🥈', label: '2nd Place', horseName: results.secondHorseName, horseId: results.secondHorseId, cls: 'second' },
    { emoji: '🥉', label: '3rd Place', horseName: results.thirdHorseName, horseId: results.thirdHorseId, cls: 'third' },
  ].filter(p => p.horseName) : [];

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
        <span className="trophy-animate" style={{ fontSize: '4rem', display: 'block', marginBottom: '12px' }}>🏆</span>
        <h2>{sweep.name}</h2>
        <p style={{ color: 'var(--muted-light)', marginTop: '6px' }}>It&apos;s a wrap! Here are the results.</p>
        {results?.autoRecorded && (
          <p style={{ color: 'var(--yellow)', fontSize: '0.8rem', marginTop: '4px' }}>✅ Auto-recorded from TAB</p>
        )}
      </div>

      {results && places.length > 0 ? (
        <>
          <p className="section-title">Race Results</p>
          <div className="result-podium">
            {places.map(({ emoji, label, horseName, horseId, cls }) => {
              const winner = horseId != null ? horseToEntry[horseId] : null;
              const isMyHorse = winner?.userId === currentUid;
              return (
                <div key={cls} className={`result-place ${cls}`}>
                  <div className="place-number">{emoji}</div>
                  <div className="place-info">
                    <div className="place-horse">{horseName}</div>
                    <div className={`place-owner ${isMyHorse ? 'winner-name' : ''}`}>
                      {winner ? (
                        <>
                          {isMyHorse ? '⭐ YOU — ' : ''}
                          {winner.displayName}
                          {cls === 'first' ? ' 🎉' : ''}
                        </>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Unassigned</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {(() => {
            const firstEntry = results.firstHorseId != null ? horseToEntry[results.firstHorseId] : null;
            if (firstEntry?.userId === currentUid) {
              return (
                <div className="card card-highlighted" style={{ textAlign: 'center', margin: '24px 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🥳</div>
                  <h3 style={{ color: 'var(--yellow)' }}>You Beauty! You Won!</h3>
                  <p style={{ color: 'var(--muted-light)', marginTop: '6px' }}>
                    Your horse <strong style={{ color: 'var(--yellow)' }}>{firstEntry.horseName || results.firstHorseName}</strong> won the {sweep.race}!
                  </p>
                </div>
              );
            }
            return null;
          })()}
        </>
      ) : (
        <div className="alert alert-info">Results are being tabulated...</div>
      )}

      <p className="section-title" style={{ marginTop: '24px' }}>All Entries</p>
      <div className="entry-list">
        {entries.map(entry => (
          <div
            key={entry.id}
            className={`entry-row ${entry.userId === currentUid ? 'is-me' : ''}`}
          >
            <div className="entry-avatar">{getInitials(entry.displayName)}</div>
            <div style={{ flex: 1 }}>
              <div className="entry-name">{entry.displayName}</div>
              {entry.horseName && (
                <div style={{ fontSize: '0.8rem', color: 'var(--muted-light)', marginTop: '2px' }}>
                  🐴 {entry.horseName}
                </div>
              )}
            </div>
            {entry.userId === currentUid && <span className="entry-badge">You</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main SweepDetail ────────────────────────────────────────────────────────

export default function SweepDetail() {
  const { sweepId } = useParams();
  const [sweep, setSweep] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [raceStartTime, setRaceStartTime] = useState(null);

  const currentUid = getSessionId();

  useEffect(() => {
    if (!sweepId) return;

    const sweepUnsub = onSnapshot(
      doc(db, 'sweeps', sweepId),
      (snap) => {
        if (!snap.exists()) {
          setError('Sweep not found.');
          setLoading(false);
          return;
        }
        setSweep({ id: snap.id, ...snap.data() });
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError('Failed to load sweep.');
        setLoading(false);
      }
    );

    const entriesUnsub = onSnapshot(
      collection(db, 'sweeps', sweepId, 'entries'),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          if (a.userId === sweep?.creatorId) return -1;
          if (b.userId === sweep?.creatorId) return 1;
          return (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0);
        });
        setEntries(list);
      }
    );

    return () => { sweepUnsub(); entriesUnsub(); };
  }, [sweepId]);

  // Fetch race start time once for TAB-linked sweeps that haven't completed yet
  useEffect(() => {
    if (!sweep || !hasTAB(sweep) || sweep.status === 'completed' || raceStartTime) return;
    fetchRaceDetail(sweep.tabDate, sweep.tabRaceType, sweep.tabVenueMnemonic, sweep.tabRaceNumber)
      .then(detail => { if (detail.raceStartTime) setRaceStartTime(detail.raceStartTime); })
      .catch(() => {});
  }, [sweep?.id]);

  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '60vh' }}>
        <div className="loading-spinner" />
        <span>Loading sweep...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '80px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🤔</div>
        <h3>{error}</h3>
        <Link to="/" className="btn btn-secondary" style={{ marginTop: '24px' }}>
          Back to Home
        </Link>
      </div>
    );
  }

  if (!sweep) return null;

  return (
    <div className="page">
      <div style={{ marginBottom: '20px' }}>
        <Link to="/" style={{ color: 'var(--muted)', fontSize: '0.875rem', textDecoration: 'none' }}>
          ← Home
        </Link>
      </div>

      {raceStartTime && sweep.status !== 'completed' && (
        <Countdown targetIso={raceStartTime} />
      )}

      {sweep.status === 'open' && (
        <LobbyView
          sweep={sweep}
          sweepId={sweepId}
          entries={entries}
          currentUid={currentUid}
        />
      )}

      {sweep.status === 'drawn' && (
        <DrawReveal
          sweep={sweep}
          sweepId={sweepId}
          entries={entries}
          currentUid={currentUid}
        />
      )}

      {sweep.status === 'racing' && (
        <RaceDayView
          sweep={sweep}
          sweepId={sweepId}
          entries={entries}
          currentUid={currentUid}
        />
      )}

      {sweep.status === 'completed' && (
        <ResultsView
          sweep={sweep}
          sweepId={sweepId}
          entries={entries}
          currentUid={currentUid}
        />
      )}
    </div>
  );
}
