const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PAYPAL_BASE = process.env.PAYPAL_MODE === "sandbox"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

// ── MCP Tool: list_tools ─────────────────────────────────────────
app.get("/tools", (req, res) => {
  res.json({
    tools: [
      {
        name: "get_paypal_token",
        description: "Get a PayPal access token for API calls",
        parameters: {}
      },
      {
        name: "send_payout",
        description: "Send a PayPal payout to a supplier",
        parameters: {
          recipient_email: "string — supplier PayPal email",
          amount_usd: "number — amount in USD",
          note: "string — payment note/reference",
          sender_item_id: "string — unique reference ID"
        }
      },
      {
        name: "create_invoice",
        description: "Create a PayPal invoice for a supplier order",
        parameters: {
          supplier_email: "string",
          item_name: "string",
          quantity: "number",
          unit_price: "number",
          currency: "string — default USD"
        }
      },
      {
        name: "get_transaction_status",
        description: "Get status of a PayPal payout batch",
        parameters: {
          batch_id: "string — PayPal payout batch ID"
        }
      }
    ]
  });
});

// ── Helper: get access token ─────────────────────────────────────
async function getAccessToken() {
  if (CLIENT_ID === "sandbox_placeholder") {
    return "SANDBOX_MOCK_TOKEN";
  }
  const response = await axios.post(
    `${PAYPAL_BASE}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      auth: { username: CLIENT_ID, password: CLIENT_SECRET },
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }
  );
  return response.data.access_token;
}

// ── Tool: send_payout ────────────────────────────────────────────
app.post("/tools/send_payout", async (req, res) => {
  const { recipient_email, amount_usd, note, sender_item_id } = req.body;

  // MOCK mode when no real PayPal keys
  if (CLIENT_ID === "sandbox_placeholder") {
    console.log(`[MCP][MOCK] Payout: $${amount_usd} → ${recipient_email} | Ref: ${sender_item_id}`);
    return res.json({
      success: true,
      mock: true,
      batch_id: `MOCK-BATCH-${Date.now()}`,
      status: "PENDING",
      message: `Mock payout of $${amount_usd} to ${recipient_email} queued`,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const token = await getAccessToken();
    const response = await axios.post(
      `${PAYPAL_BASE}/v1/payments/payouts`,
      {
        sender_batch_header: {
          sender_batch_id: sender_item_id,
          email_subject: `Payment from Mama Pima Distributors`,
          email_message: note
        },
        items: [{
          recipient_type: "EMAIL",
          amount: { value: amount_usd.toFixed(2), currency: "USD" },
          note,
          sender_item_id,
          receiver: recipient_email
        }]
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
    res.json({ success: true, batch_id: response.data.batch_header.payout_batch_id, status: "PENDING" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ── Tool: get_transaction_status ─────────────────────────────────
app.get("/tools/transaction_status/:batch_id", async (req, res) => {
  if (req.params.batch_id.startsWith("MOCK")) {
    return res.json({ status: "SUCCESS", mock: true, batch_id: req.params.batch_id });
  }
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${PAYPAL_BASE}/v1/payments/payouts/${req.params.batch_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json({ status: response.data.batch_header.batch_status, details: response.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ── Health check ─────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    mode: CLIENT_ID === "sandbox_placeholder" ? "MOCK" : process.env.PAYPAL_MODE,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MCP Server running on port ${PORT} [${CLIENT_ID === "sandbox_placeholder" ? "MOCK" : "LIVE"} mode]`));
