# PayPal Integration — StockAgent

## Overview

StockAgent uses PayPal as its payment backbone for two core flows:

1. **Payouts API** — pay suppliers automatically when reorder cycles are approved
2. **Invoicing API** — bill recipients (dukas, supermarkets, schools) for dispatched goods

All PayPal calls go through our **MCP Server** (Model Context Protocol) — a middleware that wraps PayPal REST APIs so the AI agent can invoke them as tools.

## Architecture

```
AI Agent (Claude Haiku 5.5)
    │
    ▼
┌──────────────┐     ┌─────────────────────────┐     ┌──────────────────┐
│  StockAgent  │────▶│  MCP Server (:3001)     │────▶│  PayPal REST API │
│  API (:3000) │     │  PayPal API Wrapper      │     │  api-m.sandbox   │
└──────────────┘     └─────────────────────────┘     └──────────────────┘
                         │
                         ├─ POST /tools/send_payout       → /v1/payments/payouts
                         ├─ POST /tools/create_invoice    → /v2/invoicing/invoices
                         ├─ POST /tools/send_invoice/:id  → /v2/invoicing/invoices/:id/send
                         ├─ GET  /tools/invoice_status/:id
                         ├─ GET  /tools/transaction_status/:id
                         └─ GET  /tools/transactions
```

## Flow 1: Supplier Payout

When stock drops below threshold → AI creates a reorder cycle → owner approves → PayPal pays the supplier.

```
POST /v1/payments/payouts
{
  "sender_batch_header": {
    "sender_batch_id": "STOCKAGENT-{cycle_id}-{timestamp}",
    "email_subject": "Payment from Mama Pima Distributors",
    "email_message": "StockAgent reorder: Unga Maize Flour 50kg x100"
  },
  "items": [{
    "recipient_type": "EMAIL",
    "amount": { "value": "2461.54", "currency": "USD" },
    "receiver": "payments@unga.co.ke",
    "sender_item_id": "STOCKAGENT-1-1234567890"
  }]
}
```

**Response:** Batch ID (e.g. `MOCK-BATCH-1794344582811`) stored on the reorder cycle for audit trail.

## Flow 2: Recipient Invoice

After goods are dispatched → invoice generated → sent to recipient via PayPal Invoicing.

```
POST /v2/invoicing/invoices
{
  "detail": {
    "invoice_number": "SA-1234567890",
    "currency_code": "USD",
    "note": "Invoice from Mama Pima Distributors via StockAgent",
    "payment_term": { "due_date": "2026-12-10" }
  },
  "invoicer": {
    "name": { "given_name": "Mama Pima", "surname": "Distributors" }
  },
  "primary_recipients": [{
    "billing_info": {
      "name": { "given_name": "Westlands Supermarket" },
      "email_address": "orders@westlands.co.ke"
    }
  }],
  "items": [{
    "name": "Bidco Cooking Oil 20L",
    "quantity": "5",
    "unit_amount": { "currency_code": "USD", "value": "34.62" },
    "unit_of_measure": "QUANTITY"
  }]
}
```

Then auto-sent:
```
POST /v2/invoicing/invoices/{id}/send
{ "send_to_invoicer": true }
```

## Authentication

```
POST /v1/oauth2/token
grant_type=client_credentials
Authorization: Basic {base64(client_id:client_secret)}
```

Token cached per-request. Sandbox credentials from `developer.paypal.com`.

## Mock Mode

When `PAYPAL_CLIENT_ID` is unset or `"sandbox_placeholder"`, the MCP server runs in **mock mode** — returns realistic fake transaction IDs (e.g. `MOCK-BATCH-*`, `MOCK-INV-*`) and logs everything to an in-memory transaction list. Zero external calls, identical API shape.

## KES → USD Conversion

All internal pricing is in Kenya Shillings (KES). Converted at rate **130 KES = 1 USD** before PayPal API calls.

## PayPal APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| OAuth 2.0 | `POST /v1/oauth2/token` | Authentication |
| Payouts | `POST /v1/payments/payouts` | Pay suppliers |
| Payouts Status | `GET /v1/payments/payouts/{id}` | Check payment status |
| Invoicing | `POST /v2/invoicing/invoices` | Create invoices |
| Invoicing Send | `POST /v2/invoicing/invoices/{id}/send` | Send to recipient |

## Files

- `mcp-server/index.js` — MCP Server wrapping PayPal APIs (280+ lines)
- `services/api/index.js` — Agent orchestration calling MCP tools
- `services/api/invoice-pdf.js` — PDF invoice generation
