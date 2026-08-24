const groundService = require("./ground.service");

// ── GET /grounds ──────────────────────────────
const getGroundsPage = async (req, res, next) => {
  try {
    const grounds = await groundService.getAllGrounds(
      req.tenant ? req.tenant.id : null,
      req.user.role,
    );
    return res.render("grounds/index", {
      title: "Manage Grounds",
      activePage: "grounds",
      grounds,
      success: req.query.success || null,
      error: req.query.error || null,
      tenant: req.tenant,
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /grounds/new ──────────────────────────
const getAddGroundPage = async (req, res, next) => {
  try {
    return res.render("grounds/form", {
      title: "Add New Ground",
      activePage: "grounds",
      ground: null,
      error: null,
      tenant: req.tenant,
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /grounds/create ──────────────────────
const createGround = async (req, res, next) => {
  try {
    // ── Server-side validation ────────────────────────────────
    const { name, phone, address, open_time, close_time, normal_rate_per_30, peak_rate_per_30, peak_start_time, peak_end_time } = req.body;
    const missing = [];
    if (!name || !name.trim())                   missing.push('Ground Name');
    if (!phone || !phone.trim())                 missing.push('Contact Number');
    if (phone && !/^[0-9]{10}$/.test(phone.trim())) missing.push('Contact Number (must be 10 digits)');
    if (!address || !address.trim())             missing.push('Address');
    if (!open_time || open_time === ':')         missing.push('Opening Time');
    if (!close_time || close_time === ':')       missing.push('Closing Time');
    // 24:00 is valid (means midnight end-of-day — next-day 12 AM)
    if (normal_rate_per_30 === '' || normal_rate_per_30 === undefined) missing.push('Normal Rate per 30 min');
    if (peak_rate_per_30 === '' || peak_rate_per_30 === undefined)     missing.push('Peak Rate per 30 min');
    if (!peak_start_time || peak_start_time === ':') missing.push('Peak Start Time');
    if (!peak_end_time || peak_end_time === ':')     missing.push('Peak End Time');

    if (missing.length > 0) {
      // Delete any uploaded files since we're not saving
      if (req.files && req.files.length > 0) {
        const fs = require('fs');
        req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(e) {} });
      }
      return res.render('grounds/form', {
        title: 'Add New Ground',
        activePage: 'grounds',
        ground: null,
        error: `Please fill in required fields: ${missing.join(', ')}`,
        tenant: req.tenant,
        csrfToken: req.body._csrf || '',
      });
    }
    // ─────────────────────────────────────────────────────────

    let tenantId = req.tenant ? req.tenant.id : null;

    // If super_admin (no tenant), assign to first available tenant
    if (!tenantId && req.user.role === "super_admin") {
      const db = require("../../config/db.config");
      const [tenants] = await db
        .promise()
        .query("SELECT id FROM tbl_tenants LIMIT 1");
      if (tenants.length > 0) tenantId = tenants[0].id;
    }

    const groundId = await groundService.createGround(req.body, tenantId);

    if (req.files && req.files.length > 0) {
      const filenames = req.files.map((f) => f.filename);
      await groundService.saveGroundImages(
        groundId,
        filenames,
        tenantId,
        req.user.role,
      );
    }

    return res.redirect(
      `/grounds/${groundId}/edit?success=Ground added! You can now manage images below.`,
    );
  } catch (error) {
    return res.render("grounds/form", {
      title: "Add New Ground",
      activePage: "grounds",
      ground: null,
      error: error.message,
      tenant: req.tenant,
    });
  }
};

// ── GET /grounds/:id/edit ─────────────────────
const getEditGroundPage = async (req, res, next) => {
  try {
    const ground = await groundService.getGroundById(
      req.params.id,
      req.tenant ? req.tenant.id : null,
      req.user.role,
    );
    return res.render("grounds/form", {
      title: "Edit Ground",
      activePage: "grounds",
      ground,
      error: null,
      tenant: req.tenant,
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /grounds/:id/update ──────────────────
const updateGround = async (req, res, next) => {
  try {
    await groundService.updateGround(
      req.params.id,
      req.body,
      req.tenant ? req.tenant.id : null,
      req.user.role,
    );

    if (req.files && req.files.length > 0) {
      const filenames = req.files.map((f) => f.filename);
      await groundService.saveGroundImages(
        req.params.id,
        filenames,
        req.tenant ? req.tenant.id : null,
        req.user.role,
      );
    }

    return res.redirect("/grounds?success=Ground updated successfully");
  } catch (error) {
    const ground = await groundService
      .getGroundById(
        req.params.id,
        req.tenant ? req.tenant.id : null,
        req.user.role,
      )
      .catch(() => ({ id: req.params.id, ...req.body, images: [] }));
    return res.render("grounds/form", {
      title: "Edit Ground",
      activePage: "grounds",
      ground,
      error: error.message,
      tenant: req.tenant,
    });
  }
};

// ── POST /grounds/:id/image/:imageId/primary ──
const setPrimaryImage = async (req, res, next) => {
  try {
    await groundService.setPrimaryImage(
      req.params.id,
      req.params.imageId,
      req.tenant ? req.tenant.id : null,
      req.user.role,
    );
    return res.redirect(
      `/grounds/${req.params.id}/edit?success=Primary image updated`,
    );
  } catch (error) {
    next(error);
  }
};

// ── POST /grounds/:id/image/:imageId/delete ───
const deleteImage = async (req, res, next) => {
  try {
    await groundService.deleteGroundImage(
      req.params.id,
      req.params.imageId,
      req.tenant ? req.tenant.id : null,
      req.user.role,
    );
    return res.redirect(`/grounds/${req.params.id}/edit`);
  } catch (error) {
    next(error);
  }
};

// ── POST /grounds/:id/toggle ──────────────────
const toggleStatus = async (req, res, next) => {
  try {
    await groundService.toggleStatus(
      req.params.id,
      req.tenant ? req.tenant.id : null,
      req.user.role,
    );
    return res.redirect("/grounds?success=Ground status updated");
  } catch (error) {
    // Surface the "cannot deactivate" error back to the grounds page instead of 500
    if (error.statusCode === 400) {
      return res.redirect(
        "/grounds?error=" + encodeURIComponent(error.message),
      );
    }
    next(error);
  }
};

// ── POST /grounds/:id/delete ──────────────────
const deleteGround = async (req, res, next) => {
  try {
    await groundService.deleteGround(
      req.params.id,
      req.tenant ? req.tenant.id : null,
      req.user.role,
    );
    return res.redirect("/grounds?success=Ground deleted successfully");
  } catch (error) {
    return res.redirect(`/grounds?error=${error.message}`);
  }
};

// ── GET /grounds/api/list (for dropdowns like Quick Book) ──────────
const getGroundsList = async (req, res, next) => {
  try {
    const grounds = await groundService.getAllGrounds(
      req.user.role === "super_admin"
        ? null
        : req.tenant
          ? req.tenant.id
          : null,
      req.user.role,
    );
    return res.json({
      success: true,
      grounds: grounds.map((g) => ({
        id: g.id,
        name: g.name,
        sport_type: g.sport_type,
        open_time: g.open_time,
        close_time: g.close_time,
        off_peak_price: g.off_peak_price,
        peak_price: g.peak_price,
        advance_booking_days: g.advance_booking_days,
        primary_image: g.primary_image,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /grounds/:id/blocks ── create a block ────────────────────────────
const createBlock = async (req, res, next) => {
  try {
    const ground_id = parseInt(req.params.id);
    const tenant_id = req.tenant ? req.tenant.id : null;
    const { start_date, end_date, block_type, start_time, end_time, reason } =
      req.body;

    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Start date and end date are required",
        });
    }
    if (new Date(end_date) < new Date(start_date)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "End date must be on or after start date",
        });
    }
    if (block_type === "time_range" && (!start_time || !end_time)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Start time and end time are required for time range blocks",
        });
    }

    const blockId = await groundService.createGroundBlock({
      ground_id,
      start_date,
      end_date,
      block_type,
      start_time: block_type === "time_range" ? start_time : null,
      end_time: block_type === "time_range" ? end_time : null,
      reason,
      tenant_id,
    });

    // Apply blocking to already-generated slots in this date range
    await applyBlockToSlots({
      ground_id,
      start_date,
      end_date,
      block_type,
      start_time,
      end_time,
      tenant_id,
    });

    return res.json({
      success: true,
      message: "Block created successfully",
      blockId,
    });
  } catch (err) {
    next(err);
  }
};

// Apply a block to existing tbl_slots rows so they turn blocked immediately.
// end_date is extended by 1 day to capture overnight slots — e.g. a ground
// open till 3AM stores those slots under the NEXT calendar date in tbl_slots,
// so blocking "8th–10th" must also update rows with date = "11th" (3AM slots).
const applyBlockToSlots = async ({
  ground_id,
  start_date,
  end_date,
  block_type,
  start_time,
  end_time,
  tenant_id,
}) => {
  const db = require("../../config/db.config");

  if (block_type === "full_day") {
    // Use exact end_date — no extension needed for full day blocks
    await db.promise().query(
      `UPDATE tbl_slots SET status = 'blocked'
             WHERE ground_id = ? AND date BETWEEN ? AND ? AND status = 'available' AND flag = 0`,
      [ground_id, start_date, end_date],
    );
  } else {
    // time_range — handle overnight (e.g. 20:00 → 00:30 next day)
    const [sh, sm] = start_time.split(":").map(Number);
    const [eh, em] = end_time.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    const isOvernight = endMins <= startMins;

    if (!isOvernight) {
      // Normal same-day range — use exact end_date
      await db.promise().query(
        `UPDATE tbl_slots SET status = 'blocked'
                 WHERE ground_id = ? AND date BETWEEN ? AND ?
                   AND start_time >= ? AND start_time < ?
                   AND status = 'available' AND flag = 0`,
        [ground_id, start_date, end_date, start_time, end_time],
      );
    } else {
      // Overnight — extend by 1 day to catch early-morning slots stored under next date
      const endDateExtended = new Date(end_date);
      endDateExtended.setDate(endDateExtended.getDate() + 1);
      const endDateStr = endDateExtended.toISOString().split("T")[0];
      await db.promise().query(
        `UPDATE tbl_slots SET status = 'blocked'
                 WHERE ground_id = ? AND date BETWEEN ? AND ?
                   AND (start_time >= ? OR start_time < ?)
                   AND status = 'available' AND flag = 0`,
        [ground_id, start_date, endDateStr, start_time, end_time],
      );
    }
  }
};

// ── GET /grounds/:id/blocks ── list blocks ────────────────────────────────
const getBlocks = async (req, res, next) => {
  try {
    const ground_id = parseInt(req.params.id);
    const tenant_id = req.tenant ? req.tenant.id : null;
    const blocks = await groundService.getGroundBlocks(ground_id, tenant_id);
    return res.json({ success: true, blocks });
  } catch (err) {
    next(err);
  }
};

// ── POST /grounds/:id/blocks/:blockId/delete ── remove a block ───────────
const deleteBlock = async (req, res, next) => {
  try {
    const ground_id = parseInt(req.params.id);
    const block_id = parseInt(req.params.blockId);
    const tenant_id = req.tenant ? req.tenant.id : null;

    // Get block details before deleting so we can unblock the slots
    const db = require("../../config/db.config");
    const [blocks] = await db
      .promise()
      .query("SELECT * FROM tbl_ground_blocks WHERE id = ? AND ground_id = ?", [
        block_id,
        ground_id,
      ]);
    if (blocks.length > 0) {
      const b = blocks[0];

      // Extend end_date by 1 day to unblock overnight slots stored under next calendar date
      if (b.block_type === "full_day") {
        // Use exact end_date — no extension for full day blocks
        await db.promise().query(
          `UPDATE tbl_slots SET status = 'available'
         WHERE ground_id = ? AND date BETWEEN ? AND ? AND status = 'blocked' AND flag = 0`,
          [ground_id, b.start_date, b.end_date],
        );
      } else {
        // For time_range, check if overnight to decide whether to extend end_date
        const [bsh, bsm] = b.start_time.slice(0, 5).split(":").map(Number);
        const [beh, bem] = b.end_time.slice(0, 5).split(":").map(Number);
        const isOvernight = beh * 60 + bem <= bsh * 60 + bsm;
        if (isOvernight) {
          // Overnight block (e.g. 20:00 → 00:30): extend end_date by 1 day to
          // capture early-morning slots stored under the next calendar date,
          // and use OR to match slots either at/after start OR before end.
          const d = new Date(b.end_date);
          d.setDate(d.getDate() + 1);
          const unblockEndDate = d.toISOString().split("T")[0];
          await db.promise().query(
            `UPDATE tbl_slots SET status = 'available'
           WHERE ground_id = ? AND date BETWEEN ? AND ?
             AND (start_time >= ? OR start_time < ?)
             AND status = 'blocked' AND flag = 0`,
            [ground_id, b.start_date, unblockEndDate, b.start_time, b.end_time],
          );
        } else {
          // Normal same-day range: use AND so only slots within [start, end) are unblocked.
          // Using OR here would match every slot in the day (any time is either
          // >= start OR < end for a 24-hour clock), incorrectly unblocking all slots.
          await db.promise().query(
            `UPDATE tbl_slots SET status = 'available'
           WHERE ground_id = ? AND date BETWEEN ? AND ?
             AND start_time >= ? AND start_time < ?
             AND status = 'blocked' AND flag = 0`,
            [ground_id, b.start_date, b.end_date, b.start_time, b.end_time],
          );
        }
      }
    }

    await groundService.deleteGroundBlock(block_id, ground_id, tenant_id);
    return res.json({ success: true, message: "Block removed successfully" });
  } catch (err) {
    next(err);
  }
};


// ── GET /grounds/:id/slots ────────────────────────
const getGroundSlots = async (req, res, next) => {
    try {
        const slots = await groundService.getGroundSlots(
            req.params.id,
            req.tenant ? req.tenant.id : null
        );
        return res.json({ success: true, slots });
    } catch (err) { next(err); }
};

// ── POST /grounds/:id/slots ───────────────────────
const saveGroundSlots = async (req, res, next) => {
    try {
        const { slots } = req.body;
        const result = await groundService.saveGroundSlots(
            req.params.id,
            slots || [],
            req.tenant ? req.tenant.id : null
        );
        const skipped = result.skipped || [];
        const message = skipped.length
            ? 'Slots saved. ' + skipped.length + ' slot(s) kept unchanged due to existing bookings: ' + skipped.join(', ')
            : 'Slots saved successfully';
        return res.json({ success: true, message, skipped });
    } catch (err) { next(err); }
};

// ── GET /grounds/api/slots?ground_id=&date= ───────
// Used by Quick Book to load slots for a date
const getSlotsForDate = async (req, res, next) => {
    try {
        const { ground_id, date } = req.query;
        if (!ground_id || !date) return res.status(400).json({ success: false, message: 'ground_id and date required' });
        const slots = await groundService.getSlotsForDate(
            ground_id, date,
            req.tenant ? req.tenant.id : null
        );
        return res.json({ success: true, slots });
    } catch (err) { next(err); }
};

module.exports = {
  getGroundsPage,
  getAddGroundPage,
  createGround,
  getEditGroundPage,
  updateGround,
  setPrimaryImage,
  deleteImage,
  toggleStatus,
  deleteGround,
  getGroundsList,
  getGroundSlots,
  saveGroundSlots,
  getSlotsForDate,
  createBlock,
  getBlocks,
  deleteBlock,
};