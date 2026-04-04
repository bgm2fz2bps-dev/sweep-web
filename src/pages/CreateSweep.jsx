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
        participantIds: [uid],
      };

      if (!useManual && selectedMeeting && selectedRace) {
        sweepData.tabDate = selectedMeeting.date;
        sweepData.tabRaceType = selectedMeeting.raceType;
        sweepData.tabVenueMnemonic = selectedMeeting.venueMnemonic;
        sweepData.tabRaceNumber = selectedRace.raceNumber;
        sweepData.tabMeetingName = selectedMeeting.meetingName;
      }

      await setDoc(sweepRef, sweepData);
      await addDoc(collection(db, 'sweeps', sweepId, 'entries'), {
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
        <Link to="/" style={{ color: 'var(--muted)', fontSize: '0.875rem', textDecoration: 'none' }}>← Back</Link>
        <h2 style={{ marginTop: '16px' }}>Create a Sweep</h2>
        <p style={{ color: 'var(--muted-light)', marginTop: '4px' }}>Set it up, share the code, and let fate decide. 🎲</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="card">

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
              )
�}� End of B64 content - Must use READ to get full content