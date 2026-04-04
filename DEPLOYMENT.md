# Deployment & Notifications Setup

## 1. Deploy to Vercel (Web App)

The web app is already configured for Vercel. To deploy:

```bash
cd ~/Projects/sweep-web
git push origin main
```

Vercel will automatically deploy when you push to `main`.

**Public URL:** https://your-vercel-project.vercel.app

## 2. Set Up Race Result Notifications

### Option A: Using Resend (Recommended - Simple & Free)

1. **Sign up at** https://resend.com (free tier gives you email sending)

2. **Get your API key:**
   - Go to https://resend.com/api-keys
   - Create a new API key
   - Copy it

3. **Configure Firebase Cloud Functions:**
   ```bash
   firebase functions:config:set resend.key="your_api_key_here"
   firebase deploy --only functions
   ```

4. **Update email sender:**
   - In `functions/src/checkRaceResults.js`, line ~94, change `from: 'sweepapp@resend.dev'` to your verified Resend domain

### Option B: Using SendGrid + Firebase Extensions

1. **Sign up at** https://sendgrid.com (free tier)

2. **Get API key and set up sender email**

3. **Install Firebase Extension:**
   ```bash
   firebase ext:install sendgrid-send-email
   ```

4. **Follow the prompts** (it will ask for your SendGrid API key)

### Option C: Using Firebase Built-in Email (Limited)

Use Firebase Extensions to send emails with mailgun or another provider.

---

## 3. Deploy Cloud Function

After setting up your email service:

```bash
cd functions
npm install
firebase deploy --only functions:checkRaceResults
```

This sets up a scheduler that checks for race results every 5 minutes.

---

## 4. Store User Emails

**Important:** The notification system needs email addresses. Currently, you'll need to:

Option A (Simple): Ask users to enter their email when joining a sweep
```javascript
// In SweepDetail.jsx joinSweep function, ask for email if not stored
const userEmail = prompt('Enter your email for race notifications:');
await addDoc(collection(db, 'sweeps', sweepId, 'entries'), {
  ...
  userEmail: userEmail,
});
```

Option B (Better): Store email in user profile during signup/creation

---

## 5. Test the Setup

1. Create a test sweep linked to a real TAB race that's about to happen
2. Check logs: `firebase functions:log`
3. When race results come in, you should receive an email
4. Emails go to all participants saying to check if they won

---

## Notes

- Cloud Function checks every 5 minutes during racing hours
- Emails are sent as soon as race transitions to "Resulted" status
- Winners get a special 🎉 notification
- The sweep automatically transitions to "completed" status once results are recorded
- If email service is not configured, the function runs but logs a warning

---

## Troubleshooting

- **Emails not sending?** Check `firebase functions:log` for errors
- **No results detected?** TAB API might be slow updating status - try waiting a few minutes
- **Need to resend results?** Delete the results doc in Firestore and re-run: `firebase functions:call checkRaceResults`
