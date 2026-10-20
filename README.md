# Meta Lead Ads – Real-Time POC

> **UnQue Cloudbook Assignment** — Proof of concept demonstrating live Meta Lead Ad submissions appearing instantly in a React Native app.

---

## 🏗️ Architecture

```
Meta Lead Testing Tool
        │
        │  POST /webhook  (leadgen event)
        ▼
┌──────────────────────────────────┐
│   Node.js + Express Backend      │
│  • Webhook receiver              │
│  • Fetches leads via Graph API   │
│  • Broadcasts via WebSocket      │
│  • ngrok tunnel (public URL)     │
└──────────────┬───────────────────┘
               │  WebSocket (ws://)
               ▼
┌──────────────────────────────────┐
│   React Native App (Expo)        │
│  • LeadsScreen with FlatList     │
│  • useWebSocket hook             │
│  • Animated real-time insertion  │
└──────────────────────────────────┘
```

### Why WebSockets?
- Persistent bidirectional connection — no polling needed
- Sub-100ms latency from server to device
- Handles reconnects automatically

---

## 📁 Project Structure

```
UnQue Assignment/
├── backend/
│   ├── server.js          # Express + WebSocket server
│   ├── package.json
│   ├── .env               # Your secrets (not committed)
│   └── .env.example       # Template
└── MetaLeadsApp/
    ├── App.js             # Root component
    ├── app.json           # Expo config
    └── src/
        ├── hooks/
        │   └── useWebSocket.js    # WS connection + state
        └── screens/
            └── LeadsScreen.js     # Main UI
```

---

## 🚀 Setup & Run

### Prerequisites
- Node.js ≥ 18
- npm
- [Expo Go](https://expo.dev/go) app on your device **OR** Android Studio emulator
- [ngrok](https://ngrok.com) account (free tier works)
- A [Meta / Facebook Developer](https://developers.facebook.com) account

---

### Step 1 – Start the Backend

```bash
cd backend
# Windows PowerShell: Copy-Item .env.example .env
# macOS/Linux: cp .env.example .env
# Fill in .env with your Meta credentials (see Step 3)
npm start
```

Server starts on `http://localhost:3000`.

---

### Step 2 – Expose Backend via ngrok

```bash
# In a new terminal
ngrok http 3000
```

Copy the **Forwarding URL** (e.g. `https://abc123.ngrok-free.app`).

### Host the backend on Render (optional, replaces ngrok)

The repository includes a `render.yaml` Blueprint for the `backend/` service.
It installs only the backend dependencies and prompts you to enter the webhook
verify token and Page access token securely in Render. Do not commit `.env`.

1. Push this repository to GitHub.
2. In Render, choose **New** → **Blueprint**, then select the repository.
3. Enter the two prompted secret values from your local `backend/.env`.
4. After deployment, copy the public service URL, for example
   `https://unque-meta-leads-backend.onrender.com`.
5. In Meta Webhooks, change the callback URL to
   `https://unque-meta-leads-backend.onrender.com/webhook` and verify it.
6. In `MetaLeadsApp/.env`, set
   `EXPO_PUBLIC_WS_URL=wss://unque-meta-leads-backend.onrender.com`, then
   restart Expo.

Render terminates HTTPS for the public URL, so the mobile app must use `wss://`
instead of `ws://` when it connects to the hosted backend.

---

### Step 3 – Set Up Meta App & Webhook

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → Create App → **Business**
2. Add the **"Leads Access"** product to your app
3. Under **Webhooks**:
   - Click **Subscribe to this object** → choose **Page**
   - Callback URL: `https://abc123.ngrok-free.app/webhook`
   - Verify Token: `unque_cloudbook_verify_token_2024` (matches your `.env`)
   - Subscribe to the **`leadgen`** field
4. Generate a **Page Access Token** via Graph API Explorer and add it to `.env`
5. Restart the backend: `npm start`

---

### Step 4 – Run the React Native App

**Android Emulator (recommended for demo):**
```bash
# PowerShell: $env:EXPO_PUBLIC_WS_URL="ws://10.0.2.2:3000"
cd MetaLeadsApp
npm run android
```

**Physical Device (via Expo Go):**
1. Find your computer's LAN IP (for example, `192.168.1.20`) and ensure the
   phone and computer are on the same Wi-Fi network.
2. In PowerShell, run:
   ```powershell
   $env:EXPO_PUBLIC_WS_URL="ws://192.168.1.20:3000"
   npx expo start
   ```
3. Scan the QR code with Expo Go. The project currently has `192.168.1.6` as a
   fallback for the existing device-demo setup; the environment variable takes
   priority and is read at bundle time, so restart Expo after changing it.

> **Note**: Android emulator uses `ws://10.0.2.2:3000` to reach localhost. iOS simulator uses `ws://localhost:3000`.

---

### Step 5 – Submit a Test Lead

1. Go to [Meta Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing)
2. Select your **Page** and **Lead Form**
3. Click **Preview Form** → fill in the fields → **Submit**
4. 🎉 The lead appears in the app **instantly!**

---

## 🧪 Local Testing (No Meta Setup Required)

You can test the full real-time flow without any Meta credentials using the `/test-lead` endpoint:

```bash
curl -X POST http://localhost:3000/test-lead \
  -H "Content-Type: application/json" \
  -d '{"name":"Priya Sharma","email":"priya@example.com","phone":"+91 98765 43210"}'
```

The lead will appear in the app immediately.

---

## 🔑 API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/webhook` | Meta webhook verification |
| `POST` | `/webhook` | Receive Meta leadgen events |
| `GET` | `/leads` | Fetch all stored leads |
| `POST` | `/test-lead` | Inject a mock lead (testing) |
| `WS` | `/` | WebSocket for real-time push |

---

## WebSocket Message Protocol

**Server → Client: Init (on connect)**
```json
{
  "type": "init",
  "data": [ /* array of all existing leads */ ]
}
```

**Server → Client: New Lead**
```json
{
  "type": "new_lead",
  "data": {
    "id": "leadgen_id",
    "field_data": [
      { "name": "full_name", "values": ["John Doe"] },
      { "name": "email",     "values": ["john@example.com"] },
      { "name": "phone_number", "values": ["+91 9999999999"] }
    ],
    "created_time": 1728950000,
    "receivedAt": "2024-10-15T06:00:00.000Z"
  }
}
```

---

## Assumptions

1. **In-memory storage**: Leads are stored in a JS array (no database). They reset on server restart. A production system would use PostgreSQL/MongoDB.
2. **Single Page**: The POC is designed for a single Facebook Page. Multi-page support would require dynamic token management.
3. **WebSocket URL**: The app's current fallback is configured for the existing physical-device LAN address (`192.168.1.6`). Set `EXPO_PUBLIC_WS_URL` to override it—use `ws://10.0.2.2:3000` for an Android emulator, `ws://localhost:3000` for an iOS simulator, or your host's LAN IP for another phone.
4. **No auth on WebSocket**: Any client that knows the server URL can connect. Production would require JWT/token auth on the WS handshake.
5. **No HTTPS on local server**: ngrok provides the TLS termination for Meta's webhook; the local server itself is plain HTTP.
6. **Lead field data**: If no `PAGE_ACCESS_TOKEN` is configured, the app shows only the raw webhook payload (lead ID, form ID). With a token, full field data (name, email, phone) is fetched from Graph API.
