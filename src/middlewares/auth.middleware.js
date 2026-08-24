const db = require("../config/db.config");
const { errorResponse } = require("../utils/response");
const { generateToken } = require("../utils/helpers");
const { hashToken } = require("../modules/auth/auth.service");

const authMiddleware = async (req, res, next) => {
  try {
    const isSuperAdminRoute =
      req.path.startsWith("/") && req.baseUrl.startsWith("/super-admin");
    let access_token = null;

    if (isSuperAdminRoute) {
      access_token = req.cookies?.sa_access_token || null;
    } else {
      access_token = req.cookies?.access_token || null;
    }

    if (!access_token) {
      if (
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"))
      ) {
        return res.status(401).json(errorResponse("Access token required"));
      }
      return res.redirect("/auth/login");
    }

    // Hash the raw token before DB lookup.
    const access_token_hash = hashToken(access_token);

    // Find valid session (refresh token still alive = session not fully expired)
    const [sessions] = await db.promise().query(
      `SELECT * FROM tbl_sessions
             WHERE access_token = ?
             AND is_active = 1
             AND refresh_expires_at > NOW()`,
      [access_token_hash],
    );

    if (sessions.length === 0) {
      if (
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"))
      ) {
        return res.status(401).json(errorResponse("Invalid or expired token"));
      }
      return res.redirect("/auth/login");
    }

    const session = sessions[0];

    // FIX: Fetch user + role FIRST before any branching logic.
    // Previously this was done after the token-refresh branch, meaning
    // req.user.role was missing if code order ever changed.
    const [userRows] = await db
      .promise()
      .query(
        "SELECT id, name, email, profile_image, role, is_suspended FROM tbl_users WHERE id = ? LIMIT 1",
        [session.user_id],
      );

    if (userRows.length === 0) {
      if (
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"))
      ) {
        return res.status(401).json(errorResponse("User not found"));
      }
      return res.redirect("/auth/login");
    }

    const user = userRows[0];

    // ── Suspended account — block immediately ─────────────
    if (user.is_suspended && user.role !== "super_admin") {
      // Invalidate the session in DB so token can't be reused
      await db
        .promise()
        .query("UPDATE tbl_sessions SET is_active = 0 WHERE id = ?", [
          session.id,
        ]);
      const cookieName = isSuperAdminRoute ? "sa_access_token" : "access_token";
      const cookiePath = isSuperAdminRoute ? "/super-admin" : "/";
      res.clearCookie(cookieName, {
        path: cookiePath,
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        domain: ".startsports.in", 
      });
      if (
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json"))
      ) {
        return res
          .status(403)
          .json(
            errorResponse(
              "Your account has been suspended. Please contact support.",
            ),
          );
      }
      return res.redirect("/auth/login?suspended=1");
    }

    // ── Maintenance mode — block tenant admins only ───────
    if (user.role === "admin" && !isSuperAdminRoute) {
      const [[maintenanceSetting]] = await db
        .promise()
        .query(
          `SELECT setting_value FROM tbl_app_settings WHERE setting_key = 'maintenance_mode' LIMIT 1`,
        );
      if (maintenanceSetting && maintenanceSetting.setting_value === "1") {
        // Fetch custom message if set
        const [[msgSetting]] = await db
          .promise()
          .query(
            `SELECT setting_value FROM tbl_app_settings WHERE setting_key = 'maintenance_message' LIMIT 1`,
          );
        const maintenanceMessage =
          msgSetting?.setting_value ||
          "The platform is currently under maintenance. Please check back shortly.";

        if (
          req.xhr ||
          (req.headers.accept &&
            req.headers.accept.includes("application/json"))
        ) {
          return res
            .status(503)
            .json(
              errorResponse(
                "Platform is under maintenance. Please try again later.",
              ),
            );
        }
        // Render a maintenance page instead of redirecting to login
        return res.status(503).render("maintenance", {
          title: "Under Maintenance",
          message: maintenanceMessage,
        });
      }
    }

    // ── Token refresh + sliding cookie window ────────────
    const now = new Date();
    const accessExpiry = new Date(session.access_expires_at);
    const cookieName = isSuperAdminRoute ? "sa_access_token" : "access_token";
    const cookiePath = isSuperAdminRoute ? "/super-admin" : "/";
    const cookieOpts = {
      maxAge: 15 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: cookiePath,
      domain: ".startsports.in",
    };

    if (now > accessExpiry) {
      // ── Token expired — rotate to a new token ─────────
      const new_access_token = generateToken(40);
      const new_access_hash = hashToken(new_access_token);

      await db.promise().query(
        `UPDATE tbl_sessions
                 SET access_token      = ?,
                     access_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
                     last_used_at      = NOW()
                 WHERE id = ?`,
        [new_access_hash, session.id],
      );

      // Send the new raw token to the client
      res.cookie(cookieName, new_access_token, cookieOpts);
      req.sessionData = { ...session, access_token: new_access_token };
    } else {
      // ── Token still valid — slide the expiry window ───
      // Extend the DB expiry so an active user never hits the wall.
      await db.promise().query(
        `UPDATE tbl_sessions
                 SET access_expires_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE),
                     last_used_at      = NOW()
                 WHERE id = ?`,
        [session.id],
      );

      // Re-set the cookie with a fresh 15-min maxAge from right now.
      // The token value stays the same — only the expiry is extended.
      res.cookie(cookieName, access_token, cookieOpts);
      req.sessionData = session;
    }

    // ── Attach user + role to req (always set here now) ──
    req.user = {
      user_id: user.id,
      role: user.role,
    };

    // Available in all EJS views as res.locals.user
    res.locals.user = user;

    // ── If admin, fetch their tenant info ─────────────────
    // Super admin does not have a tenant row — skip entirely
    if (user.role === "admin") {
      const [tenantRows] = await db
        .promise()
        .query("SELECT * FROM tbl_tenants WHERE user_id = ? LIMIT 1", [
          user.id,
        ]);

      if (tenantRows.length === 0) {
        // Account exists but no tenant row — something went wrong during signup
        if (
          req.xhr ||
          (req.headers.accept &&
            req.headers.accept.includes("application/json"))
        ) {
          return res
            .status(403)
            .json(errorResponse("Tenant account not found"));
        }
        return res.redirect("/auth/login");
      }

      // Attach tenant to req so every service can use req.tenant.id
      req.tenant = tenantRows[0];
      res.locals.tenant = tenantRows[0];

      // ── Inject subscription status for sidebar badge ──────
      try {
        const [[sub]] = await db.promise().query(
          `SELECT status, billing_cycle, expires_at FROM tbl_subscriptions
           WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`,
          [tenantRows[0].id]
        );
        if (sub) {
          const now      = new Date();
          const expiry   = new Date(sub.expires_at);
          const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
          res.locals.subStatus = {
            status:       sub.status,        // 'active' | 'expired' | 'inactive' | 'trial'
            billing_cycle: sub.billing_cycle,
            daysLeft:     daysLeft,
            isExpired:    sub.status === 'expired' || daysLeft <= 0,
            isExpiringSoon: sub.status === 'active' && daysLeft > 0 && daysLeft <= 7,
            isTrial:      sub.billing_cycle === 'trial'
          };
        } else {
          res.locals.subStatus = null;
        }
      } catch(e) {
        res.locals.subStatus = null;
      }

      // ── Block tenants awaiting super admin approval ───────
      if (tenantRows[0].status === 'pending_approval') {
        await db.promise().query('UPDATE tbl_sessions SET is_active = 0 WHERE id = ?', [session.id]);
        res.clearCookie('access_token', { path: '/', httpOnly: true, sameSite: 'lax', secure: true });
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
          return res.status(403).json(errorResponse('Your account is pending approval from the administrator. Please wait for confirmation.'));
        }
        return res.redirect('/auth/login?pending=1');
      }
    }

    // ── Fetch support contact for sidebar (available on every page) ──
    try {
      const [supportRows] = await db.promise().query(
        `SELECT setting_key, setting_value FROM tbl_app_settings
                 WHERE setting_key IN ('support_email','support_phone','support_hours')`,
      );
      const supportMap = {};
      supportRows.forEach((r) => {
        supportMap[r.setting_key] = r.setting_value;
      });
      res.locals.supportContact = supportMap;
    } catch (e) {
      res.locals.supportContact = {};
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authMiddleware;