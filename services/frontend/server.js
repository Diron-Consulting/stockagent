const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.static(path.join(__dirname, "public")));

app.get("/config", (req, res) => {
  res.json({
    apiUrl: process.env.API_URL || "",
    mcpUrl: process.env.MCP_URL || "",
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Frontend running on port ${PORT}`));
