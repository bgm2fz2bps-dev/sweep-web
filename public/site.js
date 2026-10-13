/* Sweep — small progressive enhancements for the static pages.
   Everything here is optional: the pages are complete without JS. */
(function () {
  'use strict';

  var CUP_DATE = '2026-11-03';
  var CUP_START = new Date('2026-11-03T15:00:00+11:00');

  // ── Join-code box → /join/CODE ────────────────────────────────────────
  document.querySelectorAll('form[data-join]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = (form.querySelector('input').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length >= 4) window.location.href = '/join/' + code;
    });
  });

  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () { window.print(); });
  });

  // ── "Your sweeps" link for returning visitors ─────────────────────────
  try {
    var ids = JSON.parse(localStorage.getItem('mySweepIds') || '[]');
    if (ids.length) document.querySelectorAll('.your-sweeps').forEach(function (el) { el.classList.add('show'); });
  } catch (e) { /* storage blocked */ }

  // ── Countdown to the Cup ──────────────────────────────────────────────
  var cds = document.querySelectorAll('[data-countdown]');
  if (cds.length) {
    var tick = function () {
      var diff = CUP_START.getTime() - Date.now();
      var text;
      if (diff <= 0) text = diff > -3 * 3600e3 ? 'Race day!' : 'Run and won';
      else {
        var d = Math.floor(diff / 86400e3), h = Math.floor(diff % 86400e3 / 3600e3), m = Math.floor(diff % 3600e3 / 60e3);
        text = d > 0 ? d + 'd ' + h + 'h ' + m + 'm' : h + 'h ' + m + 'm';
      }
      cds.forEach(function (el) { el.textContent = text; });
    };
    tick();
    setInterval(tick, 30e3);
  }

  // ── Live Cup field (chart + scratchings pages) ────────────────────────
  var table = document.getElementById('field-body');
  var scratchList = document.getElementById('scratchings-list');
  if (!table && !scratchList) return;
  var status = document.querySelectorAll('[data-field-status]');
  function setStatus(t) { status.forEach(function (el) { el.textContent = t; }); }

  function getJSON(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  getJSON('/api/races?date=' + CUP_DATE)
    .then(function (data) {
      var meeting = (data.meetings || []).filter(function (m) {
        return m.raceType === 'R' && /flemington/i.test(m.meetingName || '');
      })[0];
      if (!meeting) return null;
      var races = meeting.races || [];
      var race = races.filter(function (r) { return /melbourne cup/i.test(r.raceName || ''); })[0]
        || races.filter(function (r) { return r.raceNumber === 7; })[0];
      if (!race) return null;
      return getJSON('/api/races?date=' + CUP_DATE + '&type=R&venue=' + encodeURIComponent(meeting.venueMnemonic) + '&race=' + race.raceNumber);
    })
    .then(function (detail) {
      if (!detail) {
        setStatus('The final field isn’t out yet. It’s declared at 4:30pm AEDT on Saturday 31 October, with the barrier draw from 6:30pm. This page fills itself in after that.');
        return;
      }
      var race = detail.race || detail;
      var runners = (race.runners || []).filter(function (r) { return !r.vacantBox && !r.emergency; });
      if (!runners.length) { setStatus('Field not published yet. Check back after 4:30pm AEDT Saturday 31 October.'); return; }
      var scratched = runners.filter(function (r) { return r.scratched; });

      if (table) {
        table.innerHTML = '';
        runners.forEach(function (r) {
          var tr = document.createElement('tr');
          if (r.scratched) tr.className = 'scratched';
          [r.runnerNumber, r.runnerName, r.barrierNumber || '', '', r.scratched ? 'SCRATCHED' : '']
            .forEach(function (v, i) {
              var td = document.createElement('td');
              td.textContent = v;
              if (i === 4) td.className = 'status';
              tr.appendChild(td);
            });
          table.appendChild(tr);
        });
      }
      if (scratchList) {
        scratchList.innerHTML = '';
        if (!scratched.length) {
          var li = document.createElement('li');
          li.textContent = 'No scratchings yet.';
          scratchList.appendChild(li);
        }
        scratched.forEach(function (r) {
          var li = document.createElement('li');
          li.textContent = 'No. ' + r.runnerNumber + ' ' + r.runnerName + (r.barrierNumber ? ' (barrier ' + r.barrierNumber + ')' : '');
          scratchList.appendChild(li);
        });
      }
      setStatus('Live from TAB: ' + (runners.length - scratched.length) + ' runners' +
        (scratched.length ? ', ' + scratched.length + ' scratched' : '') + '. Updated ' +
        new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Melbourne' }) + ' AEDT.');
    })
    .catch(function () {
      setStatus('Couldn’t reach the live field right now. Try again in a minute.');
    });
})();
