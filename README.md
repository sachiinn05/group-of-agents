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

## Run locally

```
cd backend  && npm install && cp .env.example .env   # fill in the values, then:
npm run dev                                           # API on :5000

cd frontend && npm install && npm run dev             # UI (Vite prints the address)
```

`backend/.env` needs `GROQ_API_KEY`, `JWT_SECRET`, `MONGO_URI`. Never commit it.

## API

| Who | Route |
|---|---|
| Owner (JWT) | `POST /auth/signup`, `POST /auth/login` |
| Owner | `GET/POST/PUT /business`, `POST /business/documents`, `DELETE /business/documents/:id` |
| Owner | `GET /business/leads`, `PATCH /business/leads/:id` |
| Customer (no login) | `GET /public/:slug`, `GET /public/:slug/history`, `POST /public/:slug/chat` |

## Known limits

- **LLM rate limit.** The free Groq tier allows about 8,000 tokens per minute for the whole app. Each
  customer message costs roughly 1,000 to 2,000 tokens, so a busy shop will hit it. The backend waits and
  retries, then tells the customer to try again. A paid Groq plan or another provider removes this limit
  (only `backend/src/llm.js` talks to the provider).
- Alerts to the owner (email, Telegram) and an embeddable website widget are not built yet.
