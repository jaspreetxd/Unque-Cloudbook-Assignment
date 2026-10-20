/**
 * Meta Lead Ads – Real-Time Backend Server
 *
 * Flow:
 *  1. Meta sends a POST /webhook when a lead is submitted
 *  2. We fetch full lead details from Graph API
 *  3. We broadcast the lead to all connected WebSocket clients
 *  4. The React Native app displays the lead instantly
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || "my_super_secret_token_123";
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || "";
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0";

// ─── In-memory lead store ─────────────────────────────────────────────────────
/** @type {Array<Object>} */
const leads = [];
const leadIds = new Set();

function storeLead(lead) {
  if (!lead?.id || leadIds.has(lead.id)) {
    return false;
  }

  leadIds.add(lead.id);
  leads.unshift(lead);
  return true;
}

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Meta Leads Backend is running",
    leadsCount: leads.length,
    connectedClients: wss ? wss.clients.size : 0,
  });
});

// ── Privacy policy – required by Meta Instant Forms ──────────────────────────
app.get("/privacy-policy", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>UnQue Meta Leads Demo Privacy Policy</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;line-height:1.6;color:#172033}h1{line-height:1.2}</style>
</head><body>
<h1>Privacy Policy</h1>
<p>This test lead form is part of the UnQue Meta Leads Demo proof of concept.</p>
<p>Contact details submitted through the form are used only to demonstrate real-time lead delivery to the demo application. They are not sold or shared with third parties.</p>
<p>Demo lead data is stored temporarily and can be removed on request through the Facebook Page that provided this form.</p>
</body></html>`);
});

// ── GET /leads – return all stored leads (for initial app load) ───────────────
app.get("/leads", (req, res) => {
  res.json({ leads });
});

// ── GET /webhook – Meta webhook verification handshake ────────────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[Webhook] Verification request received`);
  console.log(`  mode: ${mode}`);
  console.log(`  token match: ${token === VERIFY_TOKEN}`);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Webhook] ✅ Verified successfully");
    res.status(200).send(challenge);
  } else {
    console.log("[Webhook] ❌ Verification failed");
    res.sendStatus(403);
  }
});

// ── POST /webhook – receive Meta lead events ──────────────────────────────────
app.post("/webhook", async (req, res) => {
  const body = req.body;

  console.log("\n[Webhook] 📨 Received POST:");
  console.log(JSON.stringify(body, null, 2));

  // Meta expects a 200 response quickly – acknowledge first
  res.sendStatus(200);

  if (body.object !== "page") {
    console.log("[Webhook] Not a page event, skipping.");
    return;
  }

  // Iterate over all entries and changes
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "leadgen") continue;

      const leadgenId = change.value?.leadgen_id;
      const pageId = change.value?.page_id;
      const formId = change.value?.form_id;
      const adId = change.value?.ad_id;
      const createdTime = change.value?.created_time;

      console.log(`[Webhook] 🆕 New leadgen event: ${leadgenId}`);

      // Fetch full lead data from Graph API
      let leadData = {
        id: leadgenId,
        page_id: pageId,
        form_id: formId,
        ad_id: adId,
        created_time: createdTime || Math.floor(Date.now() / 1000),
        field_data: [],
        receivedAt: new Date().toISOString(),
      };

      if (PAGE_ACCESS_TOKEN && leadgenId) {
        try {
          const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadgenId}`;
          const response = await axios.get(url, {
            // Meta does not always include the submitted answers in its default
            // response. Request field_data explicitly so the mobile app receives
            // the name, email, phone number, and any custom form answers.
            params: {
              fields: "id,created_time,field_data",
              access_token: PAGE_ACCESS_TOKEN,
            },
          });
          leadData = {
            ...leadData,
            ...response.data,
            receivedAt: new Date().toISOString(),
          };
          console.log("[Graph API] ✅ Fetched full lead data");
        } catch (err) {
          console.error("[Graph API] ❌ Failed to fetch lead:", err.message);
          console.log("[Graph API] Using raw webhook data instead");
        }
      } else {
        console.log(
          "[Graph API] ⚠️  No PAGE_ACCESS_TOKEN set – using raw webhook payload"
        );
      }

      // Meta may deliver the same webhook more than once. Only surface a lead once.
      if (!storeLead(leadData)) {
        console.log(`[Store] Duplicate lead ignored: ${leadData.id}`);
        continue;
      }
      console.log(`[Store] Total leads: ${leads.length}`);

      // Broadcast to all WebSocket clients
      broadcastLead(leadData);
    }
  }
});

// ── POST /test-lead – manual trigger for local testing (no Meta required) ─────
app.post("/test-lead", (req, res) => {
  const mockLead = {
    id: `mock_${Date.now()}`,
    created_time: Math.floor(Date.now() / 1000),
    receivedAt: new Date().toISOString(),
    field_data: [
      { name: "full_name", values: [req.body?.name || "Test User"] },
      { name: "email", values: [req.body?.email || "test@example.com"] },
      { name: "phone_number", values: [req.body?.phone || "+91 9999999999"] },
    ],
    form_id: "mock_form",
    page_id: "mock_page",
  };

  storeLead(mockLead);
  broadcastLead(mockLead);
  console.log("[Test] 🧪 Mock lead injected:", mockLead.id);
  res.json({ success: true, lead: mockLead });
});

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  console.log(`\n[WS] 🔌 Client connected (total: ${wss.clients.size})`);

  // Send all existing leads to the newly connected client
  const initPayload = JSON.stringify({
    type: "init",
    data: leads,
  });
  ws.send(initPayload);

  ws.on("message", (message) => {
    console.log(`[WS] Message from client: ${message}`);
  });

  ws.on("close", () => {
    console.log(`[WS] 🔌 Client disconnected (total: ${wss.clients.size})`);
  });

  ws.on("error", (err) => {
    console.error("[WS] Error:", err.message);
  });
});

/**
 * Broadcast a new lead to all connected WebSocket clients.
 * @param {Object} lead
 */
function broadcastLead(lead) {
  const payload = JSON.stringify({ type: "new_lead", data: lead });
  let sentCount = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sentCount++;
    }
  });
  console.log(`[WS] 📡 Broadcasted lead to ${sentCount} client(s)`);
}

// ─── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 Meta Leads Backend running on http://localhost:${PORT}`);
  console.log(`   Webhook endpoint : POST http://localhost:${PORT}/webhook`);
  console.log(`   Test endpoint    : POST http://localhost:${PORT}/test-lead`);
  console.log(`   Leads list       : GET  http://localhost:${PORT}/leads`);
  console.log(`   WebSocket        : ws://localhost:${PORT}`);
  console.log(`\n   VERIFY_TOKEN     : ${VERIFY_TOKEN}`);
  console.log(
    `   PAGE_ACCESS_TOKEN: ${PAGE_ACCESS_TOKEN ? "✅ set" : "⚠️  not set (raw webhook data only)"}\n`
  );
});
