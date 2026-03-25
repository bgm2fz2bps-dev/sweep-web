import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getSessionId } from '../identity';
import { fetchTodaysMeetings, fetchRaceDetail, todayDate } from '../tabApi';

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane' });
  } catch {
    return '';
  }
}

export default function CreateSweep() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    race: 'Melbourne Cup 2025',
    entryFee: '',
    maxEntries: 24,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // TAB race linking state
  const [useTab, setUseTab] = useState(false);
  const [meetings, setMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingsError, setMeetingsError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedRace, setSelectedRace] = useState(null);
  const [raceDetail, setRaceDetail] = useState(null);
  const [raceDetailLoading, setRaceDetailLoading] = useState(false);

  const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  // When TAB toggle is turned on, fetch today's meetings
  useEffect(() => {
    if (!useTab) return;
    setMeetingsLoading(true);
    setMeetingsError('');
    fetchTodaysMeetings()
      .then(data => {
        setMeetings(data);
        if (data.length === 0) setMeetingsError('No thoroughbred meetings found for today.');
      })
      .catch(err => {
        console.error('Meetings fetch failed:', err);
        setMeetingsError('Could not load TAB meetings. Check your connection.');
      })
      .finally(() => setMeetingsLoading(false));
  }, [useTab]);

  // When a race is selected, fetch its runners
  useEffect(() => {
    if (!selectedMeeting || !selectedRace) return;
    setRaceDetailLoading(true);
    setRaceDetail(null);
    const date = todayDate();
    fetchRaceDetail(date, selectedMeeting.raceType, selectedMeeting.venueMnemonic, selectedRace.raceNumber)
      .then(detail => {
        setRaceDetail(detail);
        // Auto-fill form fields from the selected race
        const raceName = `${selectedMeeting.meetingName} Race ${selectedRace.raceNumber}`;
        const runnerCount = detail.runners.length;
        setForm(f => ({
          ...f,
          race: raceName,
          maxEntries: Math.min(runnerCount, 24),
        }));
      })
      .catch(err => {
        console.error('Race detail fetch failed:', err);
        setMeetingsError('Could not load race runners.');
      })
      .finally(() => setRaceDetailLoading(false));
  }, [selectedMeeting, selectedRace]);

  const handleMeetingChange = (e) => {
    const m = meetings.find(m => m.venueMnemonic === e.target.value) || null;
    setSelectedMeeting(m);
    setSelectedRace(null);
    setRaceDetail(null);
  };

  const handleRaceChange = (e) => {
    if (!selectedMeeting) return;
    const raceNum = parseInt(e.target.value, 10);
    const r = selectedMeeting.races.find(r => r.raceNumber === raceNum) || null;
    setSelectedRace(r);
    setRaceDetail(null);
  };

  const handleTabToggle = (e) => {
    const on = e.target.checked;
    setUseTab(on);
    if (!on) {
      // Reset TAB state and restore defaults
      setSelectedMeeting(null);
      setSelectedRace(null);
      setRaceDetail(null);
      setMeetings([]);
      setMeetingsError('');
      setForm(f => ({ ...f, race: 'Melbourne Cup 2025', maxEntries: 24 }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Give your sweep a name, legend.');
      return;
    }
    if (!form.race.trim()) {
      setError("You'll need a race name.");
      return;
    }
    if (useTab && (!selectedMeeting || !selectedRace)) {
      setError('Pick a TAB meeting and race, or disable the TAB link.');
      return;
    }

    const uid = getSessionId();
    const displayName = localStorage.getItem('sweepDisplayName') || 'Anonymous';

    setLoading(true);
    try {
      const joinCode = generateJoinCode();
      const sweepRef = doc(collection(db, 'sweeps'));
      const sweepId = sweepRef.id;

      const sweepData = {
        name: form.name.trim(),
        race: form.race.trim(),
        entryFee: form.entryFee ? form.entryFee.trim() : null,
        maxEntries: parseInt(form.maxEntries, 10) || 24,
        joinCode,
        creatorId: uid,
        status: 'open',
        createdAt: serverTimestamp(),
        participantIds: [uid],
      };

      // Store TAB fields if a race was linked
      if (useTab && selectedMeeting && selectedRace) {
        sweepData.tabDate = todayDate();
        sweepData.tabRaceType = selectedMeeting.raceType;
        sweepData.tabVenueMnemonic = selectedMeeting.venueMnemonic;
        sweepData.tabRaceNumber = selectedRace.raceNumber;
        sweepData.tabMeetingName = selectedMeeting.meetingName;
      }

      await setDoc(sweepRef, sweepData);

      const entriesRef = collection(db, 'sweeps', sweepId, 'entries');
      await addDoc(entriesRef, {
        userId: uid,
        displayName,
        horseId: null,
        horseName: null,
        joinedAt: serverTimestamp(),
      });

      navigate(`/sweep/${sweepId}`);
    } catch (err) {
      console.error('Create sweep failed:', err);
      setError('Something went wrong. Give it another crack.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: '560px' }}>
      <div style={{ marginBottom: '28px' }}>
        <Link to="/" style={{ color: 'var(--muted)', fontSize: '0.875rem', textDecoration: 'none' }}>
          ← Back
        </Link>
        <h2 style={{ marginTop: '16px' }}>Create a Sweep</h2>
        <p style={{ color: 'var(--muted-light)', marginTop: '4px' }}>
          Set it up, share the code, and let fate decide. 🎲
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card">
        <div className="form-group">
          <label className="form-label">Sweep Name</label>
          <input
            className="input"
            type="text"
            placeholder="e.g. Work Cup Sweep 2025"
            value={form.name}
            onChange={update('name')}
            maxLength={60}
            autoFocus
          />
        </div>

        {/* TAB race link toggle */}
        <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: '4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={useTab}
              onChange={handleTabToggle}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--yellow)' }}
            />
            <span className="form-label" style={{ margin: 0 }}>🏇 Link to a TAB race today</span>
          </label>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '6px', marginLeft: '28px' }}>
            Auto-fills runners from TAB and polls for results when the race finishes.
          </p>
        </div>

        {useTab && (
          <div style={{ marginBottom: '8px' }}>
            {meetingsLoading && (
              <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
                Loading today's meetings...
              </div>
            )}
            {meetingsError && (
              <div className="alert alert-error" style={{ fontSize: '0.85rem' }}>{meetingsError}</div>
            )}
            {!meetingsLoading && meetings.length > 0 && (
              <>
                <div className="form-group">
                  <label className="form-label">Meeting</label>
                  <select
                    className="input"
                    value={selectedMeeting?.venueMnemonic || ''}
                    onChange={handleMeetingChange}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select a meeting...</option>
                    {meetings.map(m => (
                      <option key={m.venueMnemonic} value={m.venueMnemonic}>
                        {m.meetingName} ({m.location})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedMeeting && (
                  <div className="form-group">
                    <label className="form-label">Race</label>
                    <select
                      className="input"
                      value={selectedRace?.raceNumber || ''}
                      onChange={handleRaceChange}
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="">Select a race...</option>
                      {selectedMeeting.races.map(r => (
                        <option key={r.raceNumber} value={r.raceNumber}>
                          Race {r.raceNumber}{r.raceName ? ` — ${r.raceName}` : ''}{r.raceStartTime ? ` (${formatTime(r.raceStartTime)})` : ''} [{r.raceStatus}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {raceDetailLoading && (
                  <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>Loading runners...</div>
                )}

                {raceDetail && !raceDetailLoading && (
                  <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
                    ✅ <strong>{raceDetail.runners.length} runners</strong> loaded from TAB.
                    Max entries auto-set to {raceDetail.runners.length}.
                    {raceDetail.raceStatus && <> Race status: <strong>{raceDetail.raceStatus}</strong>.</>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Race</label>
          <input
            className="input"
            type="text"
            placeholder="Melbourne Cup 2025"
            value={form.race}
            onChange={update('race')}
            maxLength={80}
            readOnly={useTab && !!raceDetail}
            style={useTab && raceDetail ? { opacity: 0.7, cursor: 'default' } : {}}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Entry Fee (display only)</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. $10"
              value={form.entryFee}
              onChange={update('entryFee')}
              maxLength={20}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Max Entries</label>
            <input
              className="input"
              type="number"
              min={2}
              max={24}
              value={form.maxEntries}
              onChange={update('maxEntries')}
              readOnly={useTab && !!raceDetail}
              style={useTab && raceDetail ? { opacity: 0.7, cursor: 'default' } : {}}
            />
          </div>
        </div>

        <div className="alert alert-info" style={{ marginTop: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
          💡 A 6-character join code will be generated automatically. Share it with your mates!
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-full btn-lg"
          disabled={loading}
        >
          {loading ? 'Creating...' : '🚀 Create Sweep'}
        </button>
      </form>
    </div>
  );
}
