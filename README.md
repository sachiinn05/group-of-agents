# Groups of Agents

Log in and get a group of AI agents (career, developer, learning). Each agent has its own chat.
The **Email Writer** agent can read files you attach and send emails from your Gmail.

- `backend/` Express, MongoDB (Mongoose), JWT auth, Groq LLM
- `frontend/` React (Vite)

## Run locally

```
cd backend  && npm install && cp .env.example .env   # fill in the values, then:
npm run dev                                           # API on :5000

cd frontend && npm install && npm run dev             # UI (Vite prints the address)
```

`backend/.env` needs `GROQ_API_KEY`, `JWT_SECRET`, `MONGO_URI`. Never commit it.
Set `FRONTEND_URL` to the exact address Vite prints (for example `http://localhost:5173`).

## Attachments

Click the paperclip in any chat. PDF, Word (.docx), .txt, .csv, .md and .json, up to 3 files of 5 MB each.
The agent reads the text. The Email Writer can also attach the original file to an email.

## Connect Gmail (for the Email Writer)

1. Go to https://console.cloud.google.com and create a project.
2. **APIs & Services > Library**: enable the **Gmail API**.
3. **APIs & Services > OAuth consent screen**: choose External, fill the app name and your email.
   Under **Test users**, add the Gmail address you will send from.
4. Add the scope `https://www.googleapis.com/auth/gmail.send`.
5. **Credentials > Create credentials > OAuth client ID** (Web application).
   Authorized redirect URI: `http://localhost:5000/google/callback`
6. Put the client ID and secret in `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
7. Restart the backend, open the Email Writer and click **Connect Gmail**.

While the app is in Google's "Testing" mode, only the listed test users can connect, and the
connection expires after 7 days (you just click Connect Gmail again).

## How automatic sending works

The Email Writer sends as soon as you ask, with no preview. Safeguards: it only sends to an
address you typed in the chat or that is in your attached file, one recipient per email, and every
sent email is shown in the chat as `Sent from ... to ...`.
