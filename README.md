# Shop Agent

A shopkeeper signs up, enters shop details, uploads a price list or FAQ, and gets an AI assistant
with a public link. Customers chat with it 24/7. When a customer wants to order or get a callback,
the agent saves their name and phone as a **lead** for the owner.

- `backend/` Express, MongoDB (Mongoose), JWT auth, Groq LLM
- `frontend/` React (Vite)

## How it works

**Owner:** sign up, fill in the shop details, upload documents (PDF, Word, text; 5 MB each), share the link.
Open **Customer leads** to see who wants an order and call them back.

**Customer:** opens `/shop/<slug>` (no login) and chats. The agent answers only from the shop details and
the uploaded documents, replies in English, Hindi or Hinglish, never invents prices, and refuses
off-topic requests. If it does not know, it says the owner will check and takes the customer's number.

## Agents

After logging in, the user lands on a home screen and picks an agent. To add an agent: one card in
`frontend/src/Home.jsx`, one case in `frontend/src/App.jsx`, and its own routes in the backend.

| Agent | What it does |
|---|---|
| **Shop Agent** | Customer-facing assistant for a shop, restaurant, pharmacy, salon... (see below) |
| **Email Agent** | Sends emails by itself, depending on the situation (see below) |
| **Payment Reminder Agent** | Reminds people who owe you money, politely, until they pay (see below) |

## Email Agent

The Email Agent sends emails by itself when a **situation** becomes true for a **contact**.

1. **Contacts:** people the agent may email. Each has a status (`applied`, `interview`, `customer`...) and notes.
2. **Situations:** a rule with a trigger and what the email should say:
   - *a contact is added* (welcome email)
   - *a status changes to X* (the moment it happens)
   - *a contact stays in status X for N days* (follow-up after 5 days with no change)
3. The agent checks every minute, has the AI write each email from the contact's details and your instructions,
   adds your signature, and sends it from your Gmail. You can also talk to it: "send a thank-you to
   rahul@acme.com", or "if someone stays in applied for 7 days, follow up".

Safeguards: one email per situation per person (even if two checks overlap), a daily limit, a pause switch,
a "do not email" switch per contact, only Gmail's send permission (it cannot read your inbox), and a log of
every email. It starts in **test mode**: emails are written and listed under Sent emails but not sent. Switch to
**Live** in Settings once Gmail is connected.

### It reads your inbox too

With an App Password connection the agent also **reads your replies** (Gmail over IMAP) and acts like a real assistant:

- A contact writes back, so "no reply after N days" follow-ups stop for them.
- It reads what they said and updates their status (rejected, interview...), or marks them do-not-email if they ask to stop.
- It answers in the same email thread. In **Auto** mode it sends only safe replies (a thank-you after a rejection, a simple
  question). Anything about times, money or decisions becomes a **draft** you edit and approve in the Inbox tab.
  **Draft** mode never sends a reply by itself. **Off** ignores the inbox.
- It only handles mail from your contacts (or answers to emails it sent), only mail newer than 3 days, and ignores
  newsletters, auto-replies and no-reply senders. Mail from before you connected is never touched.
- The **Activity** tab shows everything it does, live. Every sent email lists *why* it was written.

The email text is treated as untrusted data (never as instructions), replies only go to the sender, and it starts in test mode.

### Connect your email (App Password, recommended)

1. Turn on **2-Step Verification** for your Google account.
2. Open https://myaccount.google.com/apppasswords, create an App Password called "Email Agent", copy the 16 letters.
3. Email Agent > Settings > paste your Gmail address and the App Password > **Connect**. Then switch to **Live**.

No Google Cloud project is needed. The password is stored encrypted (AES-256-GCM). Set `SECRET_KEY` in `backend/.env`
in production; if you change it, people must reconnect. Mail servers are Gmail's by default and can be changed with
`MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_IMAP_HOST`, `MAIL_IMAP_PORT`.

### Connect Gmail with Google sign-in (optional, can only send)

1. Go to https://console.cloud.google.com, create a project, and enable the **Gmail API**.
2. **OAuth consent screen:** External, add your app name, and add your Gmail address under **Test users**.
3. **Credentials > Create credentials > OAuth client ID** (Web application). Authorized redirect URI:
   `http://localhost:5000/google/callback`
4. Put the client ID and secret in `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and set
   `FRONTEND_URL` to the address of the app. Restart the backend.
5. Email Agent > Settings > **Connect Gmail**, then **Live**.

While the Google app is in "Testing", only the listed test users can connect, and the connection expires after 7 days.
The scheduler runs inside the backend process, so the backend has to be running for time-based situations to fire.

## Payment Reminder (Khata) Agent

Add who owes you money, how much, and the due date. The agent reminds them by email, politely, until they pay.

- **Schedule:** default is 1 day after the due date (gentle), 7 days (firm) and 15 days (final). You can change the days,
  the tones, and add a heads-up before the due date (a negative day, like -2). At most one reminder per check, never two
  within 2 days, and only between the sending hours you set (default 9 am to 8 pm).
- **It stops** when you record the payment (full or part: a part payment asks only for the rest), when you mark the person
  "stop reminding", when you pause them until a date ("promised to pay on Friday"), and when they **reply** (reminders pause for
  3 days so you can read it; needs the App Password connection, see Email Agent).
- **Money is never wrong:** the AI writes only the wording, with placeholders. The server fills in the exact amount, date and
  days. If the AI writes a number, a link or a threat, or is unavailable (for example its free quota is used up), a plain
  template is sent instead, so reminders keep working. Reminders never threaten.
- **No email?** Many customers only have a phone number. The agent prepares the message and a **WhatsApp** link (free, you tap send).
- **Catching up:** if the server was off for days, it sends only the latest step that applies, never a pile of old ones. After
  the last step plus 30 days it stops and leaves it to you.
- English or Hindi, your UPI id in every reminder, a log of every reminder, a live activity feed, and the same safeguards as the
  Email Agent: it starts in **test mode**, has a daily limit and a pause switch.

It sends from the Gmail account you connect in the Email Agent (Settings).

## Works for any kind of shop

One agent engine serves every business. The owner picks a **type**, and that only changes the wording,
the extra rules the agent follows, and how customers can receive an order (`backend/src/profiles.js`).

| Type | Receive by | Extra behaviour |
|---|---|---|
| General store / Grocery | Delivery, Pickup | |
| Restaurant / Cafe / Bakery / Sweets | Delivery, Pickup, Dine-in | Passes on notes (veg, spicy); asks table number for dine-in |
| Pharmacy / Medical store | Delivery, Pickup | Never gives medical advice; warns when an item needs a prescription |
| Clothing / Fashion | Delivery, Pickup | Asks size and colour |
| Electronics / Appliances | Delivery, Pickup | Mentions warranty only if written |
| Salon / Spa / Services | Book appointment | Ordering means booking: asks date and time |
| Other (any label, like "Pet shop") | Delivery, Pickup | Generic |

The owner can change how orders are received per shop. Items can have a **category** (groups the menu) and a
**note** (veg, size M, prescription required). To add a type, add one entry in `profiles.js`.

## Run locally

```
cd backend  && npm install && cp .env.example .env   # fill in the values, then:
npm run dev                                           # API on :5000

cd frontend && npm install && npm run dev             # UI (Vite prints the address)
```

`backend/.env` needs `GROQ_API_KEY`, `JWT_SECRET`, `MONGO_URI`. Never commit it.

## Features at a glance

- **Customer page** (`/shop/<slug>`): Chat, Menu, Cart, Orders. Hindi and English switch. Live order status over sockets. Offers bar.
- **Owner dashboard:** My shop, Products, Orders, Leads, Chats. New orders, leads and messages appear instantly, with unread counts.
- **Offers and announcements** with an optional end date. The page shows them and the agent mentions them.
- **Chats:** the owner reads every customer conversation and can write back from the dashboard. The customer sees it live.
- **Unanswered questions:** things customers asked that the agent could not answer, or items the shop does not stock, counted so the owner knows what to add.
- **QR code and poster** for the counter, and a **website chat widget** (one script line, see below).
- **Telegram alerts** for orders and callbacks. The owner can answer a customer by replying to the alert.

## Website chat widget

In the dashboard open My shop and copy the line under "Chat widget". It looks like this:

```html
<script src="https://YOUR-APP/widget.js" data-shop="your-shop-slug" async></script>
```

A chat button appears in the corner of the shop's website and opens the shop page in a panel.
`data-color="#e91e63"` changes the button colour. The app must be served over HTTPS and must not forbid
being framed (do not send `X-Frame-Options: DENY`) for the widget to work on other sites.

## Order alerts on Telegram (optional)

1. In Telegram, open **@BotFather**, send `/newbot`, pick a name, and copy the token it gives you.
2. Put it in `backend/.env` as `TELEGRAM_BOT_TOKEN=...` and restart the backend.
3. In the dashboard, an owner clicks **Connect Telegram**, taps **Start** in the chat that opens, and is linked.

From then on, each new order or callback request is sent to the owner's Telegram at once.
Reply to an alert in Telegram to write to that customer; your reply shows in their chat at once.
The owner can send `/stop` to the bot to turn alerts off.

## API

| Who | Route |
|---|---|
| Owner (JWT) | `POST /auth/signup`, `POST /auth/login` |
| Owner | `GET/POST/PUT /business`, `POST /business/documents`, `DELETE /business/documents/:id` |
| Owner | `GET /business/leads`, `PATCH /business/leads/:id` |
| Owner | `GET /business/telegram`, `POST /business/telegram/link`, `/test`, `/disconnect` |
| Customer (no login) | `GET /public/:slug`, `GET /public/:slug/history`, `POST /public/:slug/chat` |

## Known limits

- **LLM rate limit.** The free Groq tier allows about 8,000 tokens per minute for the whole app. Each
  customer message costs roughly 1,000 to 2,000 tokens, so a busy shop will hit it. The backend waits and
  retries, then tells the customer to try again. A paid Groq plan or another provider removes this limit
  (only `backend/src/llm.js` talks to the provider).
- An embeddable website widget is not built yet.
