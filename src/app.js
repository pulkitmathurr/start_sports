const express    = require("express");
const morgan     = require("morgan");
const routes     = require("./routes/index.route.js");
const errorMiddleware = require("./middlewares/error.middleware");
const logger     = require("./utils/logger");
const path       = require("path");
const cookieParser = require("cookie-parser");

const app = express();

// ── View engine ───────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Static files ──────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Body parsers ──────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── HTTP logger ───────────────────────────────────
app.use(
  morgan(":method :url :status :response-time ms - :res[content-length]", {
    stream: { write: (msg) => logger.info(msg.trim()) }
  })
);

// ── Root route — redirect based on session ────────
app.get("/", (req, res) => {
  logger.info("Root hit", { ip: req.ip });
  const access_token = req.cookies?.access_token;
  if (access_token) return res.redirect("/dashboard");
  return res.redirect("/auth/login");
});

// ── All module routes ───────
app.use("/", routes);

// ── 404 handler ────────
app.use((req, res) => {
  logger.warn("Route not found", {
    method: req.method,
    url:    req.originalUrl,
    ip:     req.ip,
  });
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global error handler ──────────────────────────
app.use(errorMiddleware);

module.exports = app;