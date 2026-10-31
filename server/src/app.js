const express = require("express");
const cors = require("cors");
const pool = require("./db");
const authRoutes = require("./routes/auth");
const projectRoutes = require("./routes/projects");
const taskRoutes = require("./routes/tasks");
const memberRoutes = require("./routes/members");
const invitations = require("./routes/invitations");
const billingRoutes = require("./routes/billing");
const overviewRoutes = require("./routes/overview");
const activityRoutes = require("./routes/activity");
const analyticsRoutes = require("./routes/analytics");
const calendarRoutes = require("./routes/calendar");
const clientRoutes = require("./routes/clients");
const revenueRoutes = require("./routes/revenue");
const { handleWebhook } = require("./routes/webhooks");

const app = express();

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
].filter(Boolean);

app.use(cors({ origin: allowedOrigins }));

app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  handleWebhook
);

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "taskloom-api" });
});

app.get("/health/db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");
    res.json({ status: "ok", dbTime: result.rows[0].time });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Database connection failed" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/invitations", invitations.acceptRouter);
app.use("/api/workspaces/:workspaceId/invitations", invitations.workspaceRouter);
app.use("/api/workspaces/:workspaceId/members", memberRoutes);
app.use("/api/workspaces/:workspaceId/billing", billingRoutes);
app.use("/api/workspaces/:workspaceId/overview", overviewRoutes);
app.use("/api/workspaces/:workspaceId/activity", activityRoutes);
app.use("/api/workspaces/:workspaceId/analytics", analyticsRoutes);
app.use("/api/workspaces/:workspaceId/calendar", calendarRoutes);
app.use("/api/workspaces/:workspaceId/clients", clientRoutes);
app.use("/api/workspaces/:workspaceId/revenue", revenueRoutes);
app.use("/api/workspaces/:workspaceId/projects/:projectId/tasks", taskRoutes);
app.use("/api/workspaces/:workspaceId/projects", projectRoutes);

module.exports = app;