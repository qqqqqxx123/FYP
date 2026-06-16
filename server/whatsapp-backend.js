require("dotenv").config()
const express = require("express")
const axios = require("axios")

const app = express()

const PORT = Number(process.env.PORT) || 4000
const BRIDGE_URL = process.env.BRIDGE_URL?.replace(/\/$/, "")
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL

app.use(express.json())

function getConfigError() {
  const missing = []
  if (!BRIDGE_URL) missing.push("BRIDGE_URL")
  if (!BRIDGE_API_KEY) missing.push("BRIDGE_API_KEY")
  if (!N8N_WEBHOOK_URL) missing.push("N8N_WEBHOOK_URL")
  if (!missing.length) return null
  return `Missing env vars: ${missing.join(", ")}`
}

function getBridgeHeaders() {
  return {
    "x-api-key": BRIDGE_API_KEY,
    "Content-Type": "application/json",
  }
}

function toErrorResponse(error, fallbackMessage) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 502
    const details = error.response?.data ?? error.message
    return { status, body: { error: fallbackMessage, details } }
  }
  return { status: 500, body: { error: fallbackMessage } }
}

app.get("/api/whatsapp/status", async (_req, res) => {
  try {
    const response = await axios.get(`${BRIDGE_URL}/status`, {
      headers: getBridgeHeaders(),
    })
    return res.status(200).json(response.data)
  } catch (error) {
    const err = toErrorResponse(error, "Failed to fetch WhatsApp status")
    return res.status(err.status).json(err.body)
  }
})

app.get("/api/whatsapp/qr", async (_req, res) => {
  try {
    const response = await axios.get(`${BRIDGE_URL}/qr`, {
      headers: getBridgeHeaders(),
    })
    return res.status(200).json(response.data)
  } catch (error) {
    const err = toErrorResponse(error, "Failed to fetch WhatsApp QR")
    return res.status(err.status).json(err.body)
  }
})

app.post("/api/whatsapp/send", async (req, res) => {
  const { to, message } = req.body ?? {}
  if (!to || !message) {
    return res.status(400).json({ error: "Fields 'to' and 'message' are required" })
  }

  try {
    const response = await axios.post(
      `${BRIDGE_URL}/send`,
      { to, message },
      { headers: getBridgeHeaders() }
    )
    return res.status(200).json(response.data)
  } catch (error) {
    const err = toErrorResponse(error, "Failed to send WhatsApp message")
    return res.status(err.status).json(err.body)
  }
})

app.post("/api/scam/report", async (req, res) => {
  try {
    const response = await axios.post(N8N_WEBHOOK_URL, req.body, {
      headers: { "Content-Type": "application/json" },
    })
    return res.status(200).json({
      ok: true,
      n8nStatus: response.status,
      n8nResponse: response.data,
    })
  } catch (error) {
    const err = toErrorResponse(error, "Failed to forward scam report to n8n")
    return res.status(err.status).json(err.body)
  }
})

app.get("/health", (_req, res) => res.status(200).json({ ok: true }))

app.listen(PORT, () => {
  const configError = getConfigError()
  if (configError) console.warn(`[config] ${configError}`)
  console.log(`Backend running on http://localhost:${PORT}`)
})
