const db = require("../../config/db.config");

// ── Helper: date range from preset ───────────────
const getDateRange = (preset, date_from, date_to) => {
  const today = new Date();
  const fmt = (d) => d.toISOString().split("T")[0];

  // Custom date range only wins if NO preset is selected
  // Custom single date or date range takes priority over preset
  if (date_from && date_to) return { from: date_from, to: date_to };
  if (date_from) return { from: date_from, to: date_from };

  switch (preset) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "this_week": {
      const mon = new Date(today);
      const day = today.getDay() || 7; // Sunday = 7
      mon.setDate(today.getDate() - day + 1);
      return { from: fmt(mon), to: fmt(today) };
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(start), to: fmt(today) };
    }
    case "last_3_months": {
      const start = new Date(today);
      start.setMonth(today.getMonth() - 3);
      return { from: fmt(start), to: fmt(today) };
    }
    case "last_6_months": {
      const start = new Date(today);
      start.setMonth(today.getMonth() - 6);
      return { from: fmt(start), to: fmt(today) };
    }
    default: {
      // fallback to this month
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(start), to: fmt(today) };
    }
  }
};

// ── Get all grounds for filter dropdown ──────────
const getGrounds = async () => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT id, name FROM tbl_grounds ORDER BY name ASC");
    return rows;
  } catch (err) {
    throw err;
  }
};

// ── Summary Stats ─────────────────────────────────
const getSummaryStats = async ({ from, to, ground_id }) => {
  try {
    let where = "WHERE b.slot_date BETWEEN ? AND ?";
    const params = [from, to];
    if (ground_id) {
      where += " AND b.ground_id = ?";
      params.push(ground_id);
    }

    const [rows] = await db.promise().query(
      `SELECT
                COUNT(*)                                                          AS total_bookings,
                SUM(CASE WHEN booking_status = 'confirmed'  THEN 1 ELSE 0 END)  AS confirmed,
                SUM(CASE WHEN booking_status = 'cancelled'  THEN 1 ELSE 0 END)  AS cancelled,
                SUM(CASE WHEN booking_status = 'pending'    THEN 1 ELSE 0 END)  AS pending,
                SUM(CASE WHEN booking_status = 'expired'    THEN 1 ELSE 0 END)  AS expired,
                COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN advance_amount ELSE 0 END), 0) AS total_revenue,
                COALESCE(SUM(CASE WHEN booking_status = 'confirmed' THEN balance_amount ELSE 0 END), 0) AS outstanding
             FROM tbl_bookings b ${where}`,
      params,
    );

    const s = rows[0];
    const cancellation_rate =
      s.total_bookings > 0
        ? ((s.cancelled / s.total_bookings) * 100).toFixed(1)
        : "0.0";

    return { ...s, cancellation_rate };
  } catch (err) {
    throw err;
  }
};

// ── Revenue Chart (daily) ─────────────────────────
const getRevenueChart = async ({ from, to, ground_id }) => {
  try {
    let where =
      "WHERE b.slot_date BETWEEN ? AND ? AND b.booking_status = 'confirmed'";
    const params = [from, to];
    if (ground_id) {
      where += " AND b.ground_id = ?";
      params.push(ground_id);
    }

    const [rows] = await db.promise().query(
      `SELECT
                DATE_FORMAT(b.slot_date, '%Y-%m-%d') AS date,
                COALESCE(SUM(b.advance_amount), 0)   AS revenue,
                COUNT(*)                              AS bookings
             FROM tbl_bookings b
             ${where}
             GROUP BY b.slot_date
             ORDER BY b.slot_date ASC`,
      params,
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

// ── Booking Status Breakdown ──────────────────────
const getStatusBreakdown = async ({ from, to, ground_id }) => {
  try {
    let where = "WHERE slot_date BETWEEN ? AND ?";
    const params = [from, to];
    if (ground_id) {
      where += " AND ground_id = ?";
      params.push(ground_id);
    }

    const [rows] = await db.promise().query(
      `SELECT booking_status AS status, COUNT(*) AS count
             FROM tbl_bookings ${where}
             GROUP BY booking_status`,
      params,
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

// ── Booking Type Breakdown ────────────────────────
const getTypeBreakdown = async ({ from, to, ground_id }) => {
  try {
    let where = "WHERE slot_date BETWEEN ? AND ?";
    const params = [from, to];
    if (ground_id) {
      where += " AND ground_id = ?";
      params.push(ground_id);
    }

    const [rows] = await db.promise().query(
      `SELECT booking_type AS type, COUNT(*) AS count
             FROM tbl_bookings ${where}
             GROUP BY booking_type`,
      params,
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

// ── Per Ground Comparison ─────────────────────────
const getGroundComparison = async ({ from, to }) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT
                g.name,
                COUNT(b.id)                                                           AS total,
                SUM(CASE WHEN b.booking_status = 'confirmed' THEN 1 ELSE 0 END)      AS confirmed,
                COALESCE(SUM(CASE WHEN b.booking_status = 'confirmed' THEN b.advance_amount ELSE 0 END), 0) AS revenue
             FROM tbl_grounds g
             LEFT JOIN tbl_bookings b ON b.ground_id = g.id AND b.slot_date BETWEEN ? AND ?
             GROUP BY g.id, g.name
             ORDER BY revenue DESC`,
      [from, to],
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

// ── Peak vs Off-Peak ──────────────────────────────
const getPeakSplit = async ({ from, to, ground_id }) => {
  try {
    let where =
      "WHERE b.slot_date BETWEEN ? AND ? AND b.booking_status = 'confirmed'";
    const params = [from, to];
    if (ground_id) {
      where += " AND b.ground_id = ?";
      params.push(ground_id);
    }

    const [rows] = await db.promise().query(
      `SELECT
                s.slot_type,
                COUNT(b.id)                              AS count,
                COALESCE(SUM(b.advance_amount), 0)       AS revenue
             FROM tbl_bookings b
             JOIN tbl_slots s ON s.id = b.slot_id
             ${where}
             GROUP BY s.slot_type`,
      params,
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

// ── Outstanding Payments ──────────────────────────
const getOutstanding = async ({ from, to, ground_id }) => {
  try {
    let where =
      "WHERE b.slot_date BETWEEN ? AND ? AND b.booking_status = 'confirmed' AND b.balance_amount > 0";
    const params = [from, to];
    if (ground_id) {
      where += " AND b.ground_id = ?";
      params.push(ground_id);
    }

    const [rows] = await db.promise().query(
      `SELECT
                b.booking_no,
                b.customer_name,
                b.customer_phone,
                b.slot_date,
                b.total_amount,
                b.advance_amount,
                b.balance_amount,
                g.name AS ground_name
             FROM tbl_bookings b
             LEFT JOIN tbl_grounds g ON g.id = b.ground_id
             ${where}
             ORDER BY b.balance_amount DESC
             LIMIT 50`,
      params,
    );

    const [total] = await db.promise().query(
      `SELECT COALESCE(SUM(balance_amount), 0) AS total_outstanding
             FROM tbl_bookings b
             ${where}`,
      params,
    );

    return { list: rows, total_outstanding: total[0].total_outstanding };
  } catch (err) {
    throw err;
  }
};

// ── Master report fetch ───────────────────────────
const getReportData = async ({ preset, date_from, date_to, ground_id }) => {
  try {
    const range = getDateRange(preset, date_from, date_to);
    const gid = ground_id || null;

    const [
      summary,
      revenueChart,
      statusBreakdown,
      typeBreakdown,
      groundComparison,
      peakSplit,
      outstanding,
    ] = await Promise.all([
      getSummaryStats({ from: range.from, to: range.to, ground_id: gid }),
      getRevenueChart({ from: range.from, to: range.to, ground_id: gid }),
      getStatusBreakdown({ from: range.from, to: range.to, ground_id: gid }),
      getTypeBreakdown({ from: range.from, to: range.to, ground_id: gid }),
      getGroundComparison({ from: range.from, to: range.to }),
      getPeakSplit({ from: range.from, to: range.to, ground_id: gid }),
      getOutstanding({ from: range.from, to: range.to, ground_id: gid }),
    ]);

    return {
      range,
      summary,
      revenueChart,
      statusBreakdown,
      typeBreakdown,
      groundComparison,
      peakSplit,
      outstanding,
    };
  } catch (err) {
    throw err;
  }
};

module.exports = { getGrounds, getReportData, getDateRange };
