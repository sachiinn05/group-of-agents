# Groups of Agents

A platform of AI agents. Log in, pick an agent, and put it to work.

| Agent | What it does |
|---|---|
| 🛒 **Shop Agent** | An assistant for a shop, restaurant, pharmacy, salon or any small business. Customers chat, browse the menu, order and book 24/7 on the business's own link. The owner gets every order and lead. |
| ✉️ **Email Agent** | Sends emails by itself, depending on the situation ("follow up 5 days after I applied, if they have not replied"). It also reads replies and answers the safe ones. |
| 💸 **Payment Reminder Agent** | Add who owes you money and when it is due. It reminds them politely, by email or a ready WhatsApp message, until they pay. |

All three share one login, one database and one set of safeguards: every agent starts in a **test mode** that writes
but does not send, has a daily limit and a pause switch, and keeps a log of what it did.

## Tech stack

- **Backend:** Node.js, Express, MongoDB (Mongoose), JWT login, Socket.IO for live updates
- **AI:** Groq (OpenAI-compatible API) with tool calling. Only `backend/src/llm.js` knows the provider, so it is one file to swap.
- **Email:** nodemailer (SMTP), imapflow and mailparser (reading the inbox), optional Google OAuth (send only)
- **Frontend:** React and Vite
- **Extras:** Telegram bot for owner alerts, PDF and Word reading (pdf-parse, mammoth), QR codes

## Quick start

You need Node.js 20.6 or newer and a MongoDB database (a free MongoDB Atlas cluster works).

```bash
cd backend
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # API on http://localhost:5000

cd ../frontend
npm install
npm run dev               # Vite prints the address; it proxies the API for you
```

Open the address Vite prints, sign up, and pick an agent.

### Environment (`backend/.env`, never commit it)

| Variable | Needed | What it is |
|---|---|---|
| `GROQ_API_KEY` | yes | From console.groq.com |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b` |
| `JWT_SECRET` | yes | Any long random string |
| `MONGO_URI` | yes | Your MongoDB connection string |
| `PORT` | no | Defaults to 5000 |
| `SECRET_KEY` | production | Encrypts stored App Passwords. If you change it, people must reconnect. |
| `TELEGRAM_BOT_TOKEN` | optional | Order alerts for shop owners (see Shop Agent) |
| `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | optional | "Connect with Google" for the Email Agent (send only) |
| `MAIL_SMTP_HOST/PORT`, `MAIL_IMAP_HOST/PORT` | optional | Use a mail server other than Gmail |

## Shop Agent

The owner signs up, enters the shop's details, adds products (or uploads a price list or FAQ as PDF, Word or text) and gets a
public link like `/shop/sharma-general-store`. Customers need no login.

**Customer page:** Chat, Menu, Cart and Orders, in English or Hindi. The assistant answers only from the shop's details,
products and documents, never invents a price, and refuses off-topic requests. Customers can add items from the menu or just
ask for them in chat (the assistant fills the cart and the checkout form). The total is always calculated by the server, never
by the AI. After ordering they see live status (accepted, out for delivery...) and can pay with a UPI button and rate the order.

**Owner dashboard:** My shop, Products, Orders, Leads, Chats. New orders, leads and messages appear instantly with unread
counts. The owner sets order status (accepting an order lowers counted stock; cancelling puts it back), reads every
conversation and can write back, and sees the **questions the assistant could not answer** and the items customers asked for
that the shop does not stock.

**Works for any kind of business.** The owner picks a type, and that only changes the wording, the extra rules the agent
follows and how orders can be received (`backend/src/profiles.js`). To add a type, add one entry there.

| Type | Receive by | Extra behaviour |
|---|---|---|
| General store / Grocery | Delivery, Pickup | |
| Restaurant / Cafe / Bakery / Sweets | Delivery, Pickup, Dine-in | Passes on notes (veg, spicy); asks for the table number |
| Pharmacy / Medical store | Delivery, Pickup | Never gives medical advice; warns when an item needs a prescription |
| Clothing / Fashion | Delivery, Pickup | Asks size and colour |
| Electronics / Appliances | Delivery, Pickup | Mentions warranty only if written |
| Salon / Spa / Services | Book appointment | Ordering means booking: asks date and time |
| Other (any label, like "Pet shop") | Delivery, Pickup | Generic |

Also included: offers and announcements with an end date, delivery areas, a UPI payment link, a QR code with a printable poster,
and a chat widget for the shop's own website.

**Website widget.** In My shop, copy the line under "Chat widget" into the website:

```html
<script src="https://YOUR-APP/widget.js" data-shop="your-shop-slug" async></script>
```

A chat button appears in the corner and opens the shop page in a panel. `data-color="#e91e63"` changes the colour. The app must
be served over HTTPS and must not send `X-Frame-Options: DENY`, or other sites cannot show it.

**Telegram alerts (optional).** Open @BotFather in Telegram, send `/newbot`, copy the token into `TELEGRAM_BOT_TOKEN`, and
restart. Then in the dashboard click **Connect Telegram** and tap **Start**. Each new order or callback arrives on the owner's
phone with the items and total. Replying to an alert writes to that customer. `/stop` turns alerts off.

## Email Agent

Sends emails by itself when a **situation** becomes true for a **contact**.

1. **Contacts** are the people it may email. Each has a status (`applied`, `interview`, `customer`...) and notes.
2. **Situations** are rules: *a contact is added*, *a status becomes X*, or *a contact stays in status X for N days*.
3. Every minute it checks, has the AI write each email from the contact's details and your instructions, adds your
   signature and sends it from your Gmail. You can also talk to it: "send a thank-you to rahul@acme.com", or "if someone stays
   in applied for 7 days, follow up".

It writes in your voice (your name, a short "about you", a tone, and an optional sample of your own email), avoids repeating
earlier emails to the same person, and every sent email lists **why** it was written.

**It reads your inbox too** (with the App Password connection):

- When a contact replies, "no reply after N days" follow-ups stop for them.
- It reads what they said and updates their status (rejected, interview...), or marks them do-not-email if they ask to stop.
- It answers in the same email thread. In **Auto** mode it sends only safe replies (a thank-you after a rejection, a simple
  question). Anything about times, money or decisions becomes a **draft** you edit and approve in the Inbox tab. **Draft** mode
  never sends a reply by itself, and **Off** ignores the inbox.
- It only handles mail from your contacts (or answers to emails it sent), only mail newer than 3 days, and ignores
  newsletters, auto-replies and no-reply senders. Mail from before you connected is never touched.
- The **Activity** tab shows everything it does, live.

**Safeguards:** one email per situation per person, a daily limit, a pause switch, a "do not email" switch per contact, an
address is only used if it appears exactly as you typed it (a mistyped address is refused), email text is treated as data and
never as instructions, and replies only go to the sender.

### Connect your email (App Password, recommended)

1. Turn on **2-Step Verification** for your Google account.
2. Open https://myaccount.google.com/apppasswords, create an App Password called "Email Agent" and copy the 16 letters.
3. Email Agent > Settings > paste your Gmail address and the App Password > **Connect**. Then switch to **Live**.

No Google Cloud project is needed. The password is stored encrypted (AES-256-GCM) and is checked against Gmail before it is saved.

### Connect with Google sign-in (optional, can only send)

1. At https://console.cloud.google.com create a project and enable the **Gmail API**.
2. **OAuth consent screen:** External, and add your Gmail under **Test users**.
3. **Credentials > OAuth client ID** (Web application) with the redirect URI `http://localhost:5000/google/callback`.
4. Put the client ID and secret in `backend/.env`, set `FRONTEND_URL` to the app's address, and restart.
5. Email Agent > Settings > **Connect with Google**.

While the Google app is in "Testing", only the listed test users can connect and the connection expires after 7 days.
Reading the inbox is not offered this way: Google treats it as a restricted permission that needs a paid security review.

## Payment Reminder Agent

Add who owes you money, how much, and the due date. The agent reminds them politely until they pay.

- **Schedule:** by default 1 day after the due date (gentle), 7 days (firm) and 15 days (final). You can change the days and
  tones, or add a heads-up before the due date (a negative day, like -2). At most one reminder per check, never two within
  2 days, and only between the sending hours you set (default 9 am to 8 pm).
- **It stops** when you record the payment (a part payment asks only for the rest), when you mark someone "stop reminding",
  when you pause them until a date ("promised to pay on Friday"), and when they **reply** (reminders pause for 3 days so you can
  read it; this needs the App Password connection).
- **The amount is never wrong.** The AI writes only the wording, with placeholders; the server fills in the exact amount, date
  and days. If the AI writes a number, a link or a threat, or is unavailable (for example its free quota is used up), a plain
  template is sent instead, so reminders keep working. Reminders never threaten.
- **No email?** The agent prepares the message and a **WhatsApp** link (free, you tap send).
- **Catching up:** if the server was off for days it sends only the latest step that applies, never a pile of old ones. After
  the last step plus 30 days it stops and leaves it to you.
- English or Hindi, your UPI id in every reminder, and a log of every reminder.

It sends from the Gmail account you connect in the Email Agent.

## Project structure

```
backend/src/
  server.js  auth.js  db.js  llm.js  toolLoop.js  realtime.js  activity.js     shared: app, login, models, AI, sockets
  mail.js  secrets.js  extractText.js  knowledge.js                             shared: mailbox, encryption, file reading, search
  business.js  products.js  orders.js  offers.js  chats.js  publicChat.js       Shop Agent: owner and customer routes
  shopTools.js  shopPrompt.js  profiles.js  telegram.js  ownerReply.js          Shop Agent: what the assistant can do
  emailRoutes.js  emailEngine.js  emailCompose.js  emailAgent.js  inbox.js      Email Agent
  khataRoutes.js  khataEngine.js  khataCompose.js                               Payment Reminder Agent
  emailScheduler.js  google.js                                                  the every-minute rounds, Google sign-in
frontend/src/
  App.jsx  Home.jsx  Login.jsx  api.js     login, agent picker, all API calls
  Dashboard.jsx, ShopChat.jsx, ...         Shop Agent screens (owner and customer)
  email/   khata/                          Email Agent and Payment Reminder Agent screens
frontend/public/widget.js                  the website chat widget
```

**Adding an agent:** one card in `frontend/src/Home.jsx`, one case in `frontend/src/App.jsx`, a folder of screens, and its own
routes mounted in `backend/src/server.js`. Agents that work on a schedule add their round to `emailScheduler.js`.

## API

All routes except `/public` and `/auth` need the login token (`Authorization: Bearer ...`).

| Prefix | Used by |
|---|---|
| `/auth` | Sign up and log in |
| `/business`, `/business/products`, `/business/orders`, `/business/offers` | Shop owner: shop, documents, leads, chats, unanswered questions, Telegram |
| `/public/:slug` | Customers (no login): shop info, menu, chat, cart orders, order status, rating |
| `/email` | Email Agent: settings, contacts, situations, sent emails, inbox, activity, chat |
| `/khata` | Payment Reminder Agent: dues, payments, settings, reminders sent, activity |
| `/google` | Connect with Google sign-in |

Live updates use Socket.IO: customers hear about their own order and chat, and logged-in users hear about their own agents'
work. Nobody receives another person's events.

## Known limits

- **AI rate limits.** The free Groq tier allows about 8,000 tokens per minute and 200,000 per day for the whole app, which
  supports only a handful of busy users. The backend waits and retries, then asks the person to try again. For real use, a paid
  Groq plan or another provider removes this (change `backend/src/llm.js`). The Payment Reminder Agent keeps working without the AI.
- **Schedules run inside the backend process.** Time-based emails and reminders only fire while the backend is running. Replies
  in the inbox are checked every minute.
- **The AI can be wrong.** That is why money and addresses are checked by code, risky email replies are drafts, and every agent
  starts in test mode. Try each agent in test mode first.
- **Google sign-in for the Email Agent** can only send, and works for listed test users until the app is verified by Google.
