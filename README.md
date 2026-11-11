# StockAgent

> **Agentic Commerce for FMCG Distributors** — AI-powered stock monitoring, autonomous supplier payments via PayPal, and real-time notifications.

**Live Demo:** [stockagent-frontend-r0iq.onrender.com](https://stockagent-frontend-r0iq.onrender.com)

## The Problem

FMCG (Fast-Moving Consumer Goods) distributors in East Africa manage hundreds of SKUs across dozens of suppliers and retail customers. Every reorder cycle is a manual chain: the warehouse manager checks stock, decides what's running low, calls the right supplier, negotiates quantities, sends payment, then generates an invoice for the customer who received the goods. Each step is separate, done by different people, tracked in different spreadsheets.

This creates three real problems:

1. **Stockouts from delayed reorders** — By the time someone notices Maize Flour is low, the shop has already lost 2 days of sales. The supplier needs 1-2 days lead time on top of that.
2. **Duplicate orders and overspend** — Without visibility into pending orders, two people can independently order from the same supplier for the same product. Double the cost, double the warehouse space.
3. **Payment and invoicing bottlenecks** — The accountant has to manually convert KES to USD, send PayPal payments to each supplier, then create and send invoices to each retail customer. This takes hours per reorder cycle.

**StockAgent solves all three with AI agents that monitor, decide, and pay — autonomously.**

## How It Works

```
Dispatch recorded → stock drops below threshold
        ↓
Auto-trigger fires the Primary Agent
        ↓
┌─── Stock Agent: classifies severity, measures dispatch velocity
│    Order Agent: selects supplier, calculates cost in KES
│    Compliance Agent: checks for duplicate pending orders
└─── Output: ranked recommendations with reasoning
        ↓
Reorder cycle(s) created with full cost breakdown
        ↓
Owner approves (one click) → PayPal Payout sent to supplier (KES→USD)
        ↓
Invoice generated (PDF + PayPal Invoicing API) → Email notification sent
```

One click from the business owner. Everything else is automated.

## AI Agents — What They Do and Why

StockAgent uses a **Primary Agent** (Claude Haiku 5.5 via the Anthropic SDK) that orchestrates three specialized sub-agents. Each sub-agent solves a specific part of the reorder decision:

### 1. Stock Sub-Agent — "What needs reordering?"

**Problem it solves:** Warehouse staff check stock manually, often missing items until they're already out. There's no systematic way to prioritize which products need attention first.

**What it does:**
- Scans every product's `current_stock` against its `reorder_threshold`
- Classifies severity: **Critical** (stock ≤ 30% of threshold — nearly out), **Low** (stock ≤ threshold — needs reorder), or **OK** (above threshold — skip)
- Factors in **dispatch velocity** — how many units were sold/dispatched in the last 7 days. A product at 50% threshold with 200 units dispatched this week is more urgent than one at 30% with zero movement
- Produces a ranked list of products needing reorder, most urgent first

**Example reasoning:** *"Unga Maize Flour stock at 12/40 (30%). 104 units dispatched in the last 7 days — high burn rate. At this velocity, stock depletes in under 1 day."*

### 2. Order Sub-Agent — "Who do we order from, how much, and at what cost?"

**Problem it solves:** Each product can be sourced from different suppliers with different prices and lead times. Choosing the wrong supplier means paying more or waiting longer when stock is critical.

**What it does:**
- For each product flagged by the Stock Agent, selects the **preferred supplier** (pre-configured per product based on price and reliability)
- Uses the product's default `reorder_quantity` (optimized for bulk pricing and storage capacity)
- Calculates total cost in KES: `quantity × unit_price_kes`
- Includes supplier lead time so the owner knows when to expect delivery

**Example reasoning:** *"Reorder 100 bags from Unga Group at KES 3,200 each. Total: KES 320,000 ($2,461 USD). Lead time: 1 day."*

### 3. Compliance Sub-Agent — "Is this order safe to place?"

**Problem it solves:** When multiple people manage stock or when the agent scans run frequently, the same supplier can receive duplicate orders for the same product. This wastes money and overflows warehouse capacity.

**What it does:**
- Checks if the selected supplier already has a **pending reorder cycle** (approved but not yet delivered)
- If a pending cycle exists → `compliance_check: "fail"` — the order is blocked with an explanation
- If no pending cycles → `compliance_check: "pass"` — clear to proceed

**Example reasoning:** *"Supplier Unga Group already has pending reorder cycle #3. Skipping to prevent duplicate order."* — This stops the system from sending a second PayPal payout to the same supplier for goods already on the way.

### Auto-Trigger: No Human Needed to Start

The agent doesn't wait for someone to click "scan." Every time a dispatch is recorded (`POST /api/products/:id/dispatch`), the system checks: did stock just drop below threshold? If yes, the Primary Agent fires automatically. The owner only steps in to approve the payment.

### AI Mode vs Rule Engine

- **With `ANTHROPIC_API_KEY`**: Claude Haiku 5.5 receives the full inventory snapshot (products, suppliers, pending cycles, 7-day dispatch velocity) and returns structured JSON with natural-language reasoning
- **Without API key**: A deterministic rule engine applies the exact same severity thresholds, supplier selection, and compliance checks — same decisions, same output format, no AI cost

Both modes feed into the same downstream flow: reorder cycle creation → PayPal payment → invoice generation → email notification.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    StockAgent Dashboard                      │
│            (AG Grid tables, AI activity panel)                │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                Express API (:3000)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐     │
│  │ Stock Agent  │  │ Order Agent │  │ Compliance Agent │     │
│  │ Classify     │  │ Select      │  │ Prevent duplicate│     │
│  │ severity +   │  │ supplier +  │  │ orders to same   │     │
│  │ burn rate    │  │ calc cost   │  │ supplier         │     │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘     │
│         └────────────────┼──────────────────┘               │
│                    PRIMARY AGENT                             │
│              Claude Haiku 5.5 (Anthropic SDK)                │
│                          │                                   │
│  ┌───────────────────────▼──────────────────────────────┐   │
│  │ Notifications: Email (Gmail) · Discord · WhatsApp     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              MCP Server (:3001) — PayPal Gateway             │
│  POST /v1/payments/payouts     → Supplier payments           │
│  POST /v2/invoicing/invoices   → Recipient billing           │
│  POST /v2/invoicing/invoices/:id/send → Auto-send            │
└─────────────────────────────────────────────────────────────┘
```

## PayPal Integration — Agentic Commerce

StockAgent uses **two PayPal APIs** through a **Model Context Protocol (MCP) server**. The AI agent doesn't call PayPal directly — it discovers available payment tools from the MCP server (`GET /tools`) and invokes them autonomously. This is the agentic commerce pattern: AI decides, PayPal executes.

### Use Case 1: Pay Suppliers (Payouts v1)

When the business owner approves a reorder cycle, StockAgent:
1. Converts the cost from KES to USD (÷ 130)
2. Calls the MCP server's `send_payout` tool
3. MCP server sends `POST /v1/payments/payouts` to PayPal with the supplier's email, amount, and reference
4. Supplier receives funds directly to their PayPal account
5. Email notification sent to the business owner with batch ID and amount

### Use Case 2: Bill Recipients (Invoicing v2)

After goods are dispatched to a retail customer, StockAgent:
1. Generates a local invoice with line items (product, quantity, unit price, total in KES)
2. Creates a PDF invoice via PDFKit
3. Calls the MCP server's `create_invoice` tool → `POST /v2/invoicing/invoices`
4. Auto-sends it via `POST /v2/invoicing/invoices/{id}/send`
5. Recipient receives a PayPal invoice they can pay online
6. Email notification sent with invoice number and total

| API | Endpoint | Purpose |
|-----|----------|---------|
| **Payouts v1** | `POST /v1/payments/payouts` | Pay suppliers when reorder cycles are approved |
| **Invoicing v2** | `POST /v2/invoicing/invoices` | Create invoice for recipient |
| **Invoicing Send** | `POST /v2/invoicing/invoices/{id}/send` | Auto-send invoice to recipient's email |
| **OAuth 2.0** | `POST /v1/oauth2/token` | Authenticate all API calls |

All prices stored in KES. Converted to USD (÷ 130) before every PayPal call. Full details: [`docs/PAYPAL_INTEGRATION.md`](docs/PAYPAL_INTEGRATION.md)

## Sponsor Tools

| Sponsor | How We Used It |
|---------|---------------|
| **AG Grid** | Powers all data tables in the dashboard — inventory, invoices, PayPal transactions. Sortable, filterable, dark-themed enterprise grids replace basic HTML tables. Loaded via CDN (Community Edition). |
| **Postman** | Full API collection with **26 requests across 7 folders** covering all endpoints: Products, Recipients, Invoices, Reorder Cycles, AI Agent, Analytics, and MCP PayPal. Import [`docs/StockAgent.postman_collection.json`](docs/StockAgent.postman_collection.json) to test the full API. |

## Tech Stack

| Layer | Technology |
|---|---|
| AI Agent | Claude Haiku 5.5 (Anthropic SDK) with rule-based fallback |
| Backend | Node.js / Express |
| Database | SQLite (better-sqlite3) |
| Payments | PayPal Payouts API + Invoicing API via MCP Server |
| Invoice PDFs | PDFKit |
| Frontend | Vanilla JS SPA with AG Grid |
| Notifications | Email (Nodemailer/Gmail), Discord (webhooks), WhatsApp (Twilio) |
| Deployment | Render (3 free-tier web services) |

## Features

- **AI-Powered Inventory Analysis** — 3 sub-agents analyze stock levels, dispatch velocity, and supplier availability
- **Autonomous Reorder Cycles** — From stock detection to supplier payment, fully automated with compliance checks
- **PayPal Payouts + Invoicing** — Supplier payments and recipient billing through a single MCP gateway
- **Professional Invoice PDFs** — Branded PDF generation with line items, totals, and recipient details
- **Real-time Notifications** — Email, Discord, and WhatsApp alerts for stock alerts, payouts, and invoices
- **One-Click Demo** — Full autonomous cycle: dispatch → AI scan → supplier payment → invoice generation
- **AG Grid Data Tables** — Enterprise-quality sortable, filterable grids for all data views
- **Auto-trigger** — Dispatches that drop stock below threshold automatically trigger agent scans

## Quick Start

```bash
# Install
cd mcp-server && npm install && cd ..
cd services/api && npm install && cd ../..
cd services/frontend && npm install && cd ../..

# Configure (optional — works in sandbox mode without keys)
cp .env.example services/api/.env

# Start
cd mcp-server && PORT=3001 node index.js &
cd services/api && PORT=3000 node index.js &
cd services/frontend && PORT=3002 node server.js &

# Open http://localhost:3002 → Click "Run Full Demo"
```

Works fully in sandbox mode. Set `ANTHROPIC_API_KEY` for AI analysis, PayPal credentials for live payments, `EMAIL_FROM` + `EMAIL_APP_PASSWORD` for email notifications.

## Notifications

| Event | Email | Discord | WhatsApp |
|---|---|---|---|
| Stock below threshold | HTML table with severity | Red/yellow embed | Text alert |
| Reorder cycles created | Table with cycle details | Purple embed | Text with approval link |
| PayPal payout sent | Supplier + amount details | Blue embed | Text with batch ID |
| Invoice generated | Invoice number + total | Green embed | Text with KES total |

All channels are optional — leave env vars blank and notifications are silently skipped.

## Team — Diron Technologies

| Name | Role |
|---|---|
| Sharon | AI Agent Design & LLM Integration |
| Shaddy | Business Logic & Fullstack |
| Dan | MCP Server & PayPal Integration |
| Elvis | AWS Infrastructure & Delivery |

## Prize Categories

- **Best Overall**
- **Best Use of Agentic Commerce**
- **Best Use of PayPal + AI**

---

**PayPal AI Hackathon — Build What's Next — November 2026**

Built by [Diron Technologies](https://github.com/Diron-Consulting) — Cloud & Engineering Consultancy for East Africa.
