import { useState } from 'react';

export default function NamePrompt({ onSave }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("You'll need a name to join the sweep, mate.");
      return;
    }
    if (trimmed.length < 2) {
      setError('Need at least 2 characters.');
      return;
    }
    if (trimmed.length > 30) {
      setError('Keep it under 30 characters, champ.');
      return;
    }
    localStorage.setItem('sweepDisplayName', trimmed);
    onSave(trimmed);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '12px' }}>🏇</span>
          <h2 style={{ marginBottom: '8px' }}>G'day, mate!</h2>
          <p style={{ color: 'var(--muted-light)', fontSize: '0.95rem' }}>
            What should we call you in the sweep?
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Your Name</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Dave from Accounting"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              autoFocus
              maxLength={30}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" style={{ marginTop: '8px' }}>
            Let's Go! 🚀
          </button>
        </form>
      </div>
    </div>
  );
}
