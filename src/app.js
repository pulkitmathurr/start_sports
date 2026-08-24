const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const routes = require("./routes/index.route.js");
const errorMiddleware = require("./middlewares/error.middleware");
const logger = require("./utils/logger");
const path = require("path");
const cookieParser = require("cookie-parser");
const { csrfIssuer, csrfProtect } = require("./middlewares/csrf.middleware");
const {
  authLimiter,
  logoutLimiter,
  writeLimiter,
  readLimiter,
} = require("./middlewares/ratelimit.middleware");
const cors = require('cors');
const app = express();
const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  app.set("trust proxy", 1); // Only trust proxy headers in production (behind Nginx/load balancer)
}

// ── Security headers (Helmet) ────
// CSP is configured for the CDNs this app actually uses.
// If you add a new CDN, add it to the relevant directive below.
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled: CSP blocks inline onclick handlers (modals) in production.
    // Force HTTPS in production
    hsts: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    // Prevent clickjacking
    frameguard: { action: "deny" },
    // Stop browsers guessing content types
    noSniff: true,
    // Disable X-Powered-By: Express
    hidePoweredBy: true,
    referrerPolicy: { policy: "same-origin" },
  }),
);

// ── Redirect HTTP → HTTPS in production ───────────────────────
if (isProd) {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(301, "https://" + req.headers.host + req.url);
    }
    next();
  });
}

// ── View engine ───────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Static files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Body parsers ──────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// ── HTTP logger ───────────────────────────────────────────────
app.use(
  morgan(":method :url :status :response-time ms - :res[content-length]", {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }),
);

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
// ── No-cache for all authenticated pages ──────────────────────
// Prevents browser HTTP cache from serving stale protected pages.
// bfcache is handled separately via the pageshow listener in header.ejs.
app.use((req, res, next) => {
  const isStatic =
    req.path.startsWith("/assets") ||
    req.path.startsWith("/css") ||
    req.path.startsWith("/js") ||
    req.path.startsWith("/images") ||
    req.path.startsWith("/uploads");
  if (!isStatic) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// ── CSRF: issue cookie on all GET requests ────────────────────
// csrfIssuer sets the csrf_token cookie on every page load.
// csrfProtect is applied per-route (see index.route.js) so that
// public API endpoints (e.g. /api/consumer) are not blocked.
app.use(csrfIssuer);

// Expose CSRF token to all EJS views via res.locals so plain HTML
// forms can include it as a hidden field <input name="_csrf">.
app.use((req, res, next) => {
  res.locals.csrfToken = req.cookies["csrf_token"] || "";
  next();
});

// ── Rate limiting ─────────────────────────────────────────────
// app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);
app.use("/tenant/signup", authLimiter);
// app.use("/auth/logout", logoutLimiter);
// Write limiter on all data-mutation routes
app.use("/expenses", writeLimiter);
app.use("/bookings", writeLimiter);
app.use("/grounds", writeLimiter);
app.use("/customers", writeLimiter);
app.use("/settings", writeLimiter);
app.use("/billing", writeLimiter);
app.use("/balance-sheet", readLimiter);
app.use("/reports", readLimiter);
app.use("/dashboard", readLimiter);
app.use("/api/", readLimiter);
// Academy module rate limiting
app.use("/academy", writeLimiter);

// ── Health check (no auth, no CSRF) ──────────────────────────
app.get("/health", (req, res) => {
  res.json({ success: true, message: "OK", uptime: process.uptime() });
});

// ── Root route ────────────────────────────────────────────────
app.get("/", async (req, res) => {
  logger.info("Root hit", { ip: req.ip });
  const sa_token = req.cookies?.sa_access_token;
  const admin_token = req.cookies?.access_token;

  if (sa_token || admin_token) {
    try {
      const { getSessionRole } = require("./modules/auth/auth.service");

      if (sa_token) {
        const role = await getSessionRole(sa_token);
        if (role === "super_admin")
          return res.redirect("/super-admin/dashboard");
      }

      if (admin_token) {
        const role = await getSessionRole(admin_token);
        if (role === "admin") return res.redirect("/dashboard");
      }
    } catch (err) {
      logger.error("Root route session check failed", { err: err.message });
    }
  }

  return res.redirect("/auth/login");
});

// ── All module routes ─────────────────────────────────────────
app.use("/", routes);

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, _res) => {
  logger.warn("Route not found", {
    method: _req.method,
    url: _req.originalUrl,
    ip: _req.ip,
  });
  _res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global error handler ──────────────────────────────────────
app.use(errorMiddleware);

module.exports = app;