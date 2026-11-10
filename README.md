# StockAgent

> Agentic Commerce for FMCG Distributors — autonomous stock monitoring and supplier payments via PayPal.

## The Problem

FMCG distributors in East Africa manage hundreds of SKUs manually. Every reorder cycle involves someone checking stock levels, contacting a supplier, negotiating an order, and initiating a payment separately. It is slow, error-prone, and dependent on one person remembering to act.

**StockAgent removes the human from the routine loop entirely.**

## How It Works

```
1. Stock level drops below reorder threshold (dispatch triggers auto-scan)
           ↓
2. AI Agent (Claude Haiku 5.5) analyzes inventory + dispatch velocity
           ↓
3. Sub-agents handle: stock validation, supplier selection, compliance check
           ↓
4. Reorder cycle created with AI reasoning + cost breakdown
           ↓
5. Owner approves in-app (one click)
           ↓
6. MCP Server executes PayPal Payout to supplier
           ↓
7. Invoice generated (PDF + PayPal Invoicing API)
           ↓
8. Transaction logged, stock restocked, audit trail complete
```

One click from the business owner. Everything else is automated.

## Architecture

```
[INVENTORY DB — SQLite]
        |
[Express API — Stock events + dispatch triggers]
        |
[PRIMARY AGENT — Claude Haiku 5.5 via Anthropic SDK]
        |
   ┌────┴────────────────┐
   ▼                     ▼                     ▼
[Stock Sub-Agent]  [Order Sub-Agent]  [Compliance Sub-Agent]
- Check levels     - Select supplier  - Validate supplier
- Dispatch velocity- Calculate qty    - Prevent duplicates
- Severity rating  - Draft reorder    - Flag risks
   └────┬────────────────┘
        |
[Approval Gateway — Web UI]
        |
   Owner: "APPROVE"
        |
[MCP Server — PayPal API Wrapper]
- Payouts API (supplier payments)
- Invoicing API (recipient billing)
- Transaction log + status tracking
        |
[PayPal Payment Executed + Invoice Sent]
```

## Tech Stack

| Layer | Technology |
|---|---|
| AI Agent | Claude Haiku 5.5 (Anthropic SDK) |
| Backend | Node.js / Express |
| Database | SQLite (better-sqlite3) |
| Payment Execution | PayPal Payouts API, Invoicing API |
| Agent Interface | MCP Server (Model Context Protocol) |
| Invoice Generation | PDFKit (professional PDF export) |
| Frontend | Vanilla JS SPA (dark theme, real-time agent panel) |
| Data Grids | AG Grid (sortable, filterable tables) |

## Features

- **AI-Powered Inventory Analysis** — Claude analyzes stock levels, dispatch velocity, and supplier availability to recommend optimal reorder quantities
- **Autonomous Reorder Cycles** — From stock detection to supplier payment, fully automated with compliance checks
- **PayPal Integration** — Supplier payouts via Payouts API, recipient invoicing via Invoicing API
- **Professional Invoice PDFs** — Branded PDF generation with line items, totals, and recipient details
- **Real-time Agent Visualization** — Live AI activity panel showing agent reasoning, decisions, and actions
- **Demo Mode** — One-click full demo: dispatch → AI scan → supplier payment → invoice generation
- **Compliance Engine** — Prevents duplicate orders, validates supplier availability, enforces business rules
- **Auto-trigger** — Dispatches that drop stock below threshold automatically trigger agent scans

## Quick Start

```bash
# Install dependencies
cd services/api && npm install
cd ../frontend && npm install
cd ../../mcp-server && npm install

# Configure (optional — works in mock mode without keys)
cp .env.example services/api/.env
# Set ANTHROPIC_API_KEY for AI mode
# Set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET for live PayPal

# Start all services
cd mcp-server && PORT=3001 node index.js &
cd services/api && PORT=3000 node index.js &
cd services/frontend && PORT=3002 node server.js &

# Open http://localhost:3002
```

The system works fully in mock mode (no API keys needed). Set `ANTHROPIC_API_KEY` for AI-powered analysis, and PayPal credentials for live payments.

## Team — Diron Technologies

| Name | Role |
|---|---|
| Sharon | AI Agent Design & LLM Integration |
| Shaddy | Business Logic & Fullstack |
| Dan | MCP Server & PayPal Integration |
| Elvis | AWS Infrastructure & Delivery |

## Prize Categories Targeted

- Best Overall
- Best Use of Agentic Commerce
- Best Use of PayPal + AI

**PayPal AI Hackathon — Build What's Next — Deadline: November 12, 2026**

## API Documentation

A full Postman collection with 26 requests across 7 folders is available at [`docs/StockAgent.postman_collection.json`](docs/StockAgent.postman_collection.json). Import it into Postman to explore and test all endpoints.

For details on PayPal API integration, see [`docs/PAYPAL_INTEGRATION.md`](docs/PAYPAL_INTEGRATION.md).

## Sponsor Tools Used

| Sponsor | Integration |
|---|---|
| **AG Grid** | Enterprise-quality data grids for inventory, invoices, and PayPal transaction tables |
| **Postman** | Full API collection (26 endpoints) for testing and documentation |

## What Makes StockAgent Different

Most supply chain AI tools stop at recommendations. StockAgent closes the loop — from AI insight to PayPal payment execution — in a single autonomous flow. The agent doesn't just tell you what to reorder; it orders, pays, and invoices.

## License

MIT

---

Built by [Diron Technologies](https://github.com/Diron-Consulting) — Cloud & Engineering Consultancy for East Africa.
