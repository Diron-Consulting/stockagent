# StockAgent

> **Agentic Commerce for FMCG Distributors** — AI-powered stock monitoring, autonomous supplier payments via PayPal, and real-time notifications.

**Live Demo:** [stockagent-frontend-r0iq.onrender.com](https://stockagent-frontend-r0iq.onrender.com)

## The Problem

FMCG distributors in East Africa manage hundreds of SKUs manually. Every reorder cycle involves checking stock, contacting suppliers, placing orders, and initiating payments — separately. It's slow, error-prone, and depends on one person remembering to act.

**StockAgent removes the human from the routine loop entirely.**

## How It Works

```
Dispatch triggers stock drop below threshold
        ↓
AI Agent analyzes inventory + dispatch velocity (3 sub-agents)
        ↓
Reorder cycle created with reasoning + cost breakdown
        ↓
Owner approves (one click) → PayPal Payout to supplier
        ↓
Invoice generated (PDF + PayPal Invoicing API) → Email notification sent
```

One click from the business owner. Everything else is automated.

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
│  │ Check levels │  │ Select      │  │ Prevent dupes    │     │
│  │ Burn rate    │  │ supplier    │  │ Validate supplier│     │
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

## PayPal Integration

StockAgent uses **two PayPal APIs** through a Model Context Protocol (MCP) server:

| API | Endpoint | Purpose |
|-----|----------|---------|
| **Payouts v1** | `POST /v1/payments/payouts` | Pay suppliers when reorder cycles are approved |
| **Invoicing v2** | `POST /v2/invoicing/invoices` | Bill recipients for dispatched goods |
| **Invoicing Send** | `POST /v2/invoicing/invoices/{id}/send` | Auto-send invoice to recipient |
| **OAuth 2.0** | `POST /v1/oauth2/token` | Authentication |

KES → USD conversion at rate 130 before all PayPal calls. Full details: [`docs/PAYPAL_INTEGRATION.md`](docs/PAYPAL_INTEGRATION.md)

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
