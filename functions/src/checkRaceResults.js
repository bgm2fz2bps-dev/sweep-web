const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin SDK (auto-initialized in Cloud Functions environment)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// TAB API configuration
const TAB_BASE = 'https://api.beta.tab.com.au/v1/tab-info-service';
const JURISDICTION = 'QLD';
const RESULTED_STATUSES = new Set(['Resulted', 'Paying', 'Interim']);

/**
 * Fetches race detail from TAB API
 */
async function fetchRaceDetail(date, raceType, venueMnemonic, raceNumber) {
  const url = `${TAB_BASE}/racing/dates/${date}/meetings/${raceType}/${venueMnemonic}/races/${raceNumber}?jurisdiction=${JURISDICTION}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'Origin': 'https://www.tab.com.au',
      'Referer': 'https://www.tab.com.au/',
    },
  });
  if (!res.ok) throw new Error(`TAB API error ${res.status}`);
  const data = await res.json();
  return data.race || data;
}

/**
 * Sends email via Resend (configure your API key in Cloud Functions config)
 * Or use your preferred email service
 */
async function sendEmail(toEmail, subject, htmlContent) {
  const resendApiKey = functions.config().resend?.key;
  if (!resendApiKey) {
    console.warn('Resend API key not configured. Skipping email.');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'sweepapp@resend.dev', // Change to your verified domain
      to: toEmail,
      subject,
      html: htmlContent,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

/**
 * Gets finisher runner number from race results
 */
function getFinisherRunnerNumber(raceDetail, position) {
  if (!raceDetail.results || !raceDetail.results[position]) return null;
  return raceDetail.results[position][0] ?? null;
}

/**
 * Finds runner by number in runners array
 */
function runnerByNumber(runners, runnerNumber) {
  return runners.find(r => r.runnerNumber === runnerNumber) || null;
}

/**
 * Main function: Check for race results and send notifications
 * Triggered by Cloud Scheduler every 5 minutes during racing hours
 */
exports.checkRaceResults = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
  console.log('Checking for race results...');

  try {
    // Get all sweeps with TAB data that haven't been marked as completed
    const sweeps = await db.collection('sweeps')
      .where('tabDate', '!=', null)
      .where('status', 'in', ['open', 'drawn', 'racing'])
      .get();

    console.log(`Found ${sweeps.docs.length} TAB-linked sweeps to check`);

    for (const sweepDoc of sweeps.docs) {
      const sweep = sweepDoc.data();
      const sweepId = sweepDoc.id;

      try {
        // Check if this race has resulted
        const raceDetail = await fetchRaceDetail(
          sweep.tabDate,
          sweep.tabRaceType,
          sweep.tabVenueMnemonic,
          sweep.tabRaceNumber
        );

        // If race hasn't resulted yet, skip
        if (!RESULTED_STATUSES.has(raceDetail.raceStatus)) {
          console.log(`${sweep.tabMeetingName} R${sweep.tabRaceNumber}: ${raceDetail.raceStatus} (not yet resulted)`);
          continue;
        }

        console.log(`${sweep.tabMeetingName} R${sweep.tabRaceNumber}: ${raceDetail.raceStatus} - PROCESSING RESULTS`);

        // Get all entries for this sweep
        const entries = await db.collection('sweeps').doc(sweepId).collection('entries').get();
        const entryList = entries.docs.map(d => ({ id: d.id, ...d.data() }));

        // Get results (or store them if first time seeing results)
        const existingResults = await db.collection('sweeps').doc(sweepId).collection('results').get();

        if (existingResults.empty) {
          // First time seeing results - extract and store them
          const firstRunner = getFinisherRunnerNumber(raceDetail, 0);
          const secondRunner = getFinisherRunnerNumber(raceDetail, 1);
          const thirdRunner = getFinisherRunnerNumber(raceDetail, 2);

          const resultDoc = {
            firstHorseId: firstRunner,
            firstHorseName: runnerByNumber(raceDetail.runners, firstRunner)?.runnerName || firstRunner?.toString() || null,
            secondHorseId: secondRunner,
            secondHorseName: runnerByNumber(raceDetail.runners, secondRunner)?.runnerName || secondRunner?.toString() || null,
            thirdHorseId: thirdRunner,
            thirdHorseName: runnerByNumber(raceDetail.runners, thirdRunner)?.runnerName || thirdRunner?.toString() || null,
            autoRecorded: true,
            recordedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          await db.collection('sweeps').doc(sweepId).collection('results').add(resultDoc);
          console.log(`Stored results for sweep ${sweepId}`);

          // Send emails to all participants
          await sendResultEmails(sweepId, sweep, entryList, resultDoc);

          // Update sweep status to completed
          await db.collection('sweeps').doc(sweepId).update({ status: 'completed' });
        }
      } catch (err) {
        console.error(`Error processing sweep ${sweepId}:`, err);
        // Don't stop processing other sweeps if one fails
      }
    }

    console.log('Race result check completed');
  } catch (err) {
    console.error('Error in checkRaceResults:', err);
    throw err;
  }
});

/**
 * Sends result notification emails to all participants
 */
async function sendResultEmails(sweepId, sweep, entries, results) {
  const emailPromises = entries.map(async (entry) => {
    try {
      const isWinner = entry.horseId === results.firstHorseId;
      const htmlContent = generateEmailHTML(sweep, entry, results, isWinner);

      // Get user email from participants (you'll need to store emails in the entries collection)
      // For now, using a placeholder - you'll need to implement email storage
      const userEmail = entry.userEmail || entry.userId; // Update this to store actual emails

      await sendEmail(
        userEmail,
        `${sweep.name} - ${isWinner ? '🎉 YOU WON!' : 'Race Results'}`,
        htmlContent
      );

      console.log(`Email sent to ${userEmail} for sweep ${sweepId}`);
    } catch (err) {
      console.error(`Failed to send email to ${entry.userId}:`, err);
    }
  });

  await Promise.allSettled(emailPromises);
}

/**
 * Generates HTML email content
 */
function generateEmailHTML(sweep, entry, results, isWinner) {
  const yourHorse = entry.horseName || 'Unknown';
  const firstPlace = results.firstHorseName || 'TBA';
  const secondPlace = results.secondHorseName || 'TBA';
  const thirdPlace = results.thirdHorseName || 'TBA';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #0A0E1A; color: #FFD700; padding: 20px; border-radius: 8px; text-align: center; }
          .card { background: #f5f5f5; padding: 16px; margin: 16px 0; border-radius: 8px; }
          .winner { background: #FFD700; color: #0A0E1A; padding: 20px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; }
          .result-box { background: white; padding: 12px; margin: 8px 0; border-left: 4px solid #FFD700; }
          .your-horse { font-weight: bold; color: #FFD700; font-size: 18px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏇 ${sweep.name}</h1>
            <p>${sweep.race}</p>
          </div>

          ${isWinner ? '<div class="winner">🥳 YOU WON! 🥳</div>' : ''}

          <div class="card">
            <h2>Your Horse</h2>
            <p class="your-horse">${yourHorse}</p>
          </div>

          <div class="card">
            <h2>Race Results</h2>
            <div class="result-box">
              <strong>🥇 1st Place:</strong> ${firstPlace}
            </div>
            <div class="result-box">
              <strong>🥈 2nd Place:</strong> ${secondPlace}
            </div>
            <div class="result-box">
              <strong>🥉 3rd Place:</strong> ${thirdPlace}
            </div>
          </div>

          <p style="text-align: center; color: #999; font-size: 12px;">
            Check the full results at <strong>sweep.gg</strong>
          </p>
        </div>
      </body>
    </html>
  `;
}
