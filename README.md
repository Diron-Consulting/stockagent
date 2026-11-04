# StockAgent

> Agentic Commerce for FMCG Distributors — autonomous stock monitoring and supplier payments via PayPal.

## The Problem

FMCG distributors in East Africa manage hundreds of SKUs manually. Every reorder cycle involves someone checking stock levels, contacting a supplier, negotiating an order, and initiating a payment separately. It is slow, error-prone, and dependent on one person remembering to act.

**StockAgent removes the human from the routine loop entirely.**

## How It Works

```
1. Stock level drops below reorder threshold
           ↓
2. AWS EventBridge detects the trigger
           ↓
3. Primary Logistics Agent (Amazon Bedrock) orchestrates the flow
           ↓
4. Sub-agents handle: stock validation, supplier selection, compliance check
           ↓
5. Approval request sent to owner via WhatsApp/Slack
           ↓
6. Owner replies: "approve"
           ↓
7. MCP Server executes PayPal Payout to supplier
           ↓
8. Transaction logged, stock record updated
```

One word from the business owner. Everything else is automated.

## Architecture

```
[INVENTORY DB / ERP]
        |
[AWS EventBridge] — stock threshold trigger
        |
[PRIMARY AGENT — Amazon Bedrock AgentCore]
        |
   ┌────┴────────────────┐
   ▼                     ▼                     ▼
[Stock Sub-Agent]  [Order Sub-Agent]  [Compliance Sub-Agent]
- Check levels     - Select supplier  - Validate supplier
- Calculate qty    - Draft PO         - Flag risks
   └────┬────────────────┘
        |
[Approval Gateway — WhatsApp / Slack]
        |
   Owner: "Y"
        |
[MCP Server — PayPal API Wrapper]
- Payouts API
- Invoicing API
- Transaction log
        |
[PayPal Payment Executed ✓]
```

## Tech Stack

| Layer | Technology |
|---|---|
| Trigger | AWS EventBridge |
| Agent Orchestration | Amazon Bedrock / AgentCore |
| Infra | AWS Lambda, ECS |
| Payment Execution | PayPal Payouts API, Invoicing API |
| Agent Interface | MCP Server (Model Context Protocol) |
| Approval Channel | WhatsApp / Slack |

## Team

| Name | Role |
|---|---|
| Sharon | AI Agent Design & LLM Integration |
| Shaddy | Business Logic & Order Sub-Agent |
| Dan | MCP Server & PayPal API Wrapper |
| Elvis | AWS Infrastructure & Delivery |

## Prize Categories Targeted

- Best Overall
- Best Use of Agentic Commerce
- Best Use of PayPal + AI

**PayPal AI Hackathon — Submission Deadline: November 12, 2026**

## What Makes StockAgent Different

The [AWS Agentic AI Supply Chain reference architecture](https://aws.amazon.com/blogs/industries/transform-supply-chain-logistics-with-agentic-ai/) describes agents that recommend and alert. StockAgent adds the layer that **acts and pays** — closing the loop from insight to execution via PayPal.

## Getting Started

_Setup instructions coming soon._

## License

MIT

---

Built by [Diron Technologies](https://github.com/Diron-Consulting) — Cloud & Engineering Consultancy for East Africa.
