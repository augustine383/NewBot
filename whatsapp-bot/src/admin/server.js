const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("../../config/config");
const logger = require("../services/logger");
const leadsRouter = require("./routes/leads");
const broadcastRouter = require("./routes/broadcast");
const analyticsRouter = require("./routes/analytics");
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", (req, res, next) => {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Basic ")) return res.status(401).json({ error: "Unauthorized" });
  const [user, pass] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  if (user !== config.admin.username || pass !== config.admin.password) return res.status(401).json({ error: "Invalid credentials" });
  next();
});
app.use("/api/leads", leadsRouter);
app.use("/api/broadcast", broadcastRouter);
app.use("/api/analytics", analyticsRouter);
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use(express.static(path.join(__dirname, "../../public/admin")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../../public/admin/index.html")));
function startAdminServer(botClient) {
  require("./routes/broadcast").setBotClient(botClient);
  app.listen(config.admin.port, () => {
    logger.info("Admin dashboard running at http://localhost:" + config.admin.port);
  });
}
module.exports = { startAdminServer };