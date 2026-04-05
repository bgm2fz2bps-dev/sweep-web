import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getSessionId } from '../identity';
import { fetchTodaysMeetings, fetchRaceDetail } from '../tabApi';

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
  const [form, setForm] = useState({ name: '', race: '', entryFee: '', maxEntries: 24, maxEntriesPerPerson: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Race type segmented selector
  const RACE_TYPES = [
    { key: 'R', label: 'Thoroughbred', emoji: '🐎' },
    { key: 'H', label: 'Harness',      emoji: '🐴' },
    { key: 'G', label: 'Greyhounds',    emoji: '🐕' },
  ];

  // TAB race state
  const [meetings, setMeetings] = useState([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [meetingsError, setMeetingsError] = useState('');
  const [raceTypeFilter, setRaceTypeFilter] = useState('R');
  const [openMeetings, setOpenMeetings] = useState({});
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedRace, setSelectedRace] = useState(null);
  const [raceDetail, setRaceDetail] = useState(null);
  const [raceDetailLoading, setRaceDetailLoading] = useState(false);
  const [racePickerOpen, setRacePickerOpen] = useState(true);

  // Manual entry fallback
  const [useManual, setUseManual] = useState(false);

  const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  // Fetch meetings on mount
  useEffect(() => {
    fetchTodaysMeetings()
      .then(data => {
        setMeetings(data);
        if (data.length === 0) setMeetingsError('No races found for today or tomorrow.');
      })
      .catch(err => {
        console.error('Meetings fetch failed:', err);
        setMeetingsError('Could not load TAB races. Check your connection.');
      })
      .finally(() => setMeetingsLoading(false));
  }, []);

  // Fetch runners when a race is selected
  useEffect(() => {
    if (!selectedMeeting || !selectedRace) return;
    setRaceDetailLoading(true);
    setRaceDetail(null);
    fetchRaceDetail(selectedMeeting.date, selectedMeeting.raceType, selectedMeeting.venueMnemonic, selectedRace.raceNumber)
      .then(detail => {
        setRaceDetail(detail);
        const raceName = `${selectedMeeting.meetingName} R${selectedRace.raceNumber}${selectedRace.raceName ? ` — ${selectedRace.raceName}` : ''}`;
        // For TAB sweeps, maxEntries always equals the runner count (adapts if scratches happen)
        setForm(f => ({ ...f, race: raceName, maxEntries: detail.runners.length }));
      })
      .catch(err => {
        console.error('Race detail fetch failed:', err);
        setMeetingsError('Could not load race runners.');
      })
      .finally(() => setRaceDetailLoading(false));
  }, [selectedMeeting, selectedRace]);

  const handleRaceTypeChange = (type) => {
    setRaceTypeFilter(type);
    setOpenMeetings({});
    setSelectedMeeting(null);
    setSelectedRace(null);
    setRaceDetail(null);
    setRacePickerOpen(true);
    setForm(f => ({ ...f, race: '', maxEntries: 24, maxEntriesPerPerson: 1 }));
  };

  const toggleMeeting = (key) => {
    setOpenMeetings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRaceCardClick = (meeting, race) => {
    setSelectedMeeting(meeting);
    setSelectedRace(race);
    setRaceDetail(null);
    setRacePickerOpen(false);
  };

  const switchToManual = () => {
    setUseManual(true);
    setSelectedMeeting(null);
    setSelectedRace(null);
    setRaceDetail(null);
    setRacePickerOpen(true);
    setForm(f => ({ ...f, race: '', maxEntries: 24, maxEntriesPerPerson: 1 }));
  };

  // Derive filtered meetings outside JSX so it's always fresh on every render
  const filteredMeetings = meetings.filter(
    m => m.raceType === raceTypeFilter && m.races.length > 0
  );

  const switchToTab = () => {
    setUseManual(false);
    setForm(f => ({ ...f, race: '', maxEntries: 24 }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) { setError('Give your sweep a name, legend.'); return; }
    if (!useManual && (!selectedMeeting || !selectedRace)) { setError('Pick a race first.'); return; }
    if (useManual && !form.race.trim()) { setError("You'll need a race name."); return; }

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
        maxEntriesPerPerson: parseInt(form.maxEntriesPerPerson, 10) || 1,
        joinCode,
        creatorId: uid,
        status: 'open',
        createdAt: serverTimestamp(),
        participantIds: [],
      };

      if (!useManual && selectedMeeting && selectedRace) {
        sweepData.tabDate = selectedMeeting.date;
        sweepData.tabRaceType = selectedMeeting.raceType;
        sweepData.tabVenueMnemonic = selectedMeeting.venueMnemonic;
        sweepData.tabRaceNumber = selectedRace.raceNumber;
        sweepData.tabMeetingName = selectedMeeting.meetingName;
      }

      await setDoc(sweepRef, sweepData);

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
        <Link to="/" style={{ color: 'var(--muted)', fontSize: '0.875rem', textDecoration: 'none' }}>← Back</Link>
        <h2 style={{ marginTop: '16px' }}>Create a Sweep</h2>
        <p style={{ color: 'var(--muted-light)', marginTop: '4px' }}>Set it up, share the code, and let fate decide. 🎲</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card">

        {/* ── Race type segmented picker ── */}
        {!useManual && (
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label className="form-label">🏇 Race Type</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              {RACE_TYPES.map(type => (
                <button
                  key={type.key}
                  type="button"
                  onClick={() => handleRaceTypeChange(type.key)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: raceTypeFilter === type.key ? '2px solid var(--yellow)' : '2px solid var(--border)',
                    background: raceTypeFilter === type.key ? 'var(--surface-alt)' : 'transparent',
                    color: 'var(--text)',
                    fontWeight: raceTypeFilter === type.key ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {type.emoji} {type.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB race picker (default) ── */}
        {!useManual && (
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label className="form-label" style={{ margin: 0 }}>🏇 Pick a race</label>
              {selectedRace && !racePickerOpen && (
                <button type="button" onClick={() => {
                  setRacePickerOpen(true);
                  if (selectedMeeting) {
                    const key = `${selectedMeeting.dateLabel}-${selectedMeeting.venueMnemonic}`;
                    setOpenMeetings(prev => ({ ...prev, [key]: true }));
                  }
                }}
                style={{ fontSize: '0.8rem', color: 'var(--yellow)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                  Change
                </button>
              )}
            </div>

            {meetingsLoading && <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>Loading races...</div>}
            {meetingsError && <div className="alert alert-error" style={{ fontSize: '0.85rem' }}>{meetingsError}</div>}

            {racePickerOpen && (
              <div style={{ marginBottom: '16px', maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
                {filteredMeetings.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '16px 8px' }}>No races for this type today.</p>
                ) : (
                  filteredMeetings.map((meeting) => {
                    const key = `${meeting.dateLabel}-${meeting.venueMnemonic}`;
                    const isOpen = openMeetings[key];
                    return (
                      <div key={key} style={{ marginBottom: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        <button
                          type="button"
                          onClick={() => toggleMeeting(key)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: isOpen ? 'var(--surface-alt)' : 'transparent',
                            border: 'none',
                            borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          {isOpen ? '▼' : '▶'} {meeting.dateLabel} — {meeting.meetingName}
                        </button>
                        {isOpen && (
                          <div style={{ padding: '8px' }}>
                            {meeting.races.map((race) => (
                              <button
                                key={race.raceNumber}
                                type="button"
                                onClick={() => handleRaceCardClick(meeting, race)}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  marginBottom: '6px',
                                  background: selectedRace?.raceNumber === race.raceNumber && selectedMeeting?.venueMnemonic === meeting.venueMnemonic ? 'var(--yellow)' : 'var(--surface)',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                  textAlign: 'left',
                                  color: selectedRace?.raceNumber === race.raceNumber && selectedMeeting?.venueMnemonic === meeting.venueMnemonic ? '#000' : 'var(--text)',
                                }}
                              >
                                R{race.raceNumber} {race.raceName ? ` — ${race.raceName}` : ''} ({formatTime(race.raceTime)})
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {selectedRace && !racePickerOpen && raceDetail && (
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface-alt)', borderRadius: '6px', fontSize: '0.9rem' }}>
                <strong>{selectedMeeting.meetingName} R{selectedRace.raceNumber}</strong>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                  {raceDetail.runners.length} runners
                </p>
              </div>
            )}

            {selectedRace && !racePickerOpen && (
              <button
                type="button"
                onClick={switchToManual}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'transparent',
                  border: '1px dashed var(--border)',
                  color: 'var(--muted)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  marginTop: '12px',
                }}
              >
                Override with Manual Entry
              </button>
            )}
          </div>
        )}

        {/* ── Manual entry fallback ── */}
        {useManual && (
          <div className="form-group">
            <label htmlFor="race" className="form-label">Race Name</label>
            <input
              id="race"
              type="text"
              placeholder="e.g. Melbourne Cup 2025"
              value={form.race}
              onChange={update('race')}
              className="form-input"
            />
            <button
              type="button"
              onClick={switchToTab}
              style={{
                width: '100%',
                padding: '10px',
                background: 'transparent',
                border: '1px dashed var(--border)',
                color: 'var(--muted)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                borderRadius: '4px',
                marginTop: '12px',
              }}
            >
              Back to TAB Races
            </button>
          </div>
        )}

        {/* ── Sweep name ── */}
        <div className="form-group">
          <label htmlFor="name" className="form-label">Sweep Name</label>
          <input
            id="name"
            type="text"
            placeholder="e.g. Work Sweepstake"
            value={form.name}
            onChange={update('name')}
            className="form-input"
          />
        </div>

        {/* ── Entry fee (optional) ── */}
        <div className="form-group">
          <label htmlFor="entryFee" className="form-label">Entry Fee (optional)</label>
          <input
            id="entryFee"
            type="text"
            placeholder="e.g. $5"
            value={form.entryFee}
            onChange={update('entryFee')}
            className="form-input"
          />
        </div>

        {/* ── Max entries (only for manual sweeps) ── */}
        {useManual && (
          <div className="form-group">
            <label htmlFor="maxEntries" className="form-label">Max Entries</label>
            <input
              id="maxEntries"
              type="number"
              min="1"
              value={form.maxEntries}
              onChange={update('maxEntries')}
              className="form-input"
            />
          </div>
        )}

        {/* ── Max entries per person ── */}
        <div className="form-group">
          <label htmlFor="maxEntriesPerPerson" className="form-label">Max Entries per Person</label>
          <input
            id="maxEntriesPerPerson"
            type="number"
            min="1"
            value={form.maxEntriesPerPerson}
            onChange={update('maxEntriesPerPerson')}
            className="form-input"
          />
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '6px' }}>
            How many horses can each person claim? (Default: 1)
          </p>
        </div>

        {/* ── Submit ── */}
        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: '24px' }}>
          {loading ? 'Creating...' : 'Create Sweep'}
        </button>
      </form>
    </div>
  );
}
