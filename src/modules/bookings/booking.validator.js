const { body, query } = require("express-validator");
const { validatorMiddleware } = require("../../utils/response");

module.exports.validate = (method) => {
  switch (method) {
    // ── Online Booking Request ──
    case "createBooking": {
      return [
        body("start_time")
          .notEmpty()
          .withMessage("Start time is required"),

        body("end_time")
          .notEmpty()
          .withMessage("End time is required"),

        body("slot_date")
          .notEmpty()
          .withMessage("Date is required")
          .isDate()
          .withMessage("Invalid date format"),

        body("customer_name")
          .notEmpty()
          .withMessage("Customer name is required")
          .isLength({ min: 2, max: 100 })
          .withMessage("Name must be 2-100 characters"),

        body("customer_phone")
          .notEmpty()
          .withMessage("Phone number is required")
          .matches(/^[0-9]{10}$/)
          .withMessage("Invalid phone number — must be 10 digits"),

        body("customer_email")
          .optional()
          .isEmail()
          .withMessage("Invalid email address"),

        body("notes")
          .optional()
          .isLength({ max: 500 })
          .withMessage("Notes too long"),

        validatorMiddleware,
      ];
    }

    // ── Quick Book (Admin) ────────────────────
    case "quickBook": {
      return [
        body("start_time")
          .notEmpty()
          .withMessage("Start time is required"),

        body("end_time")
          .notEmpty()
          .withMessage("End time is required"),

        body("slot_date")
          .notEmpty()
          .withMessage("Date is required")
          .isDate()
          .withMessage("Invalid date format"),

        body("customer_name")
          .notEmpty()
          .withMessage("Customer name is required")
          .isLength({ min: 2, max: 100 })
          .withMessage("Name must be 2-100 characters"),

        body("customer_phone")
          .notEmpty()
          .withMessage("Phone number is required")
          .matches(/^[0-9]{10}$/)
          .withMessage("Invalid phone number — must be 10 digits"),

        body("customer_email")
          .optional()
          .isEmail()
          .withMessage("Invalid email address"),

        body("booking_type")
          .notEmpty()
          .withMessage("Booking type is required")
          .isIn(["phone", "walkin"])
          .withMessage("Invalid booking type"),

        body("advance_amount")
          .optional()
          .isFloat({ min: 0 })
          .withMessage("Invalid amount"),

        body("payment_mode")
          .optional()
          .isIn(["cash", "upi", "card"])
          .withMessage("Invalid payment mode"),

        body("notes")
          .optional()
          .isLength({ max: 500 })
          .withMessage("Notes too long"),

        validatorMiddleware,
      ];
    }

    // ── Approve Booking ───────────────────────
    case "approveBooking": {
      return [
        body("booking_id")
          .notEmpty()
          .withMessage("Booking ID is required")
          .isInt()
          .withMessage("Invalid booking ID"),

        validatorMiddleware,
      ];
    }

    // ── Reject Booking ────────────────────────
    case "rejectBooking": {
      return [
        body("booking_id")
          .notEmpty()
          .withMessage("Booking ID is required")
          .isInt()
          .withMessage("Invalid booking ID"),

        body("reason")
          .notEmpty()
          .withMessage("Rejection reason is required")
          .isLength({ max: 255 })
          .withMessage("Reason too long"),

        validatorMiddleware,
      ];
    }

    // ── Record Payment ────────────────────────
    case "recordPayment": {
      return [
        body("booking_id")
          .notEmpty()
          .withMessage("Booking ID is required")
          .isInt()
          .withMessage("Invalid booking ID"),

        body("amount")
          .notEmpty()
          .withMessage("Amount is required")
          .isFloat({ min: 1 })
          .withMessage("Amount must be greater than 0"),

        body("payment_mode")
          .notEmpty()
          .withMessage("Payment mode is required")
          .isIn(["cash", "upi", "card"])
          .withMessage("Invalid payment mode"),

        body("payment_type")
          .notEmpty()
          .withMessage("Payment type is required")
          .isIn(["advance", "balance", "full"])
          .withMessage("Invalid payment type"),

        validatorMiddleware,
      ];
    }

    // ── Cancel Booking ────────────────────────
    case "cancelBooking": {
      return [
        body("booking_id")
          .notEmpty()
          .withMessage("Booking ID is required")
          .isInt()
          .withMessage("Invalid booking ID"),

        validatorMiddleware,
      ];
    }

    // ── Get Slots for Date ────────────────────
    case "getSlots": {
      return [
        query("date")
          .notEmpty()
          .withMessage("Date is required")
          .isDate()
          .withMessage("Invalid date format"),

        validatorMiddleware,
      ];
    }

    // ── Get All Bookings (filters) ──
    case "getAllBookings": {
      return [
        query("status")
          .optional()
          .isIn([
            "pending",
            "approved",
            "confirmed",
            "completed",
            "rejected",
            "cancelled",
            "expired",
          ])
          .withMessage("Invalid status"),

        query("payment_status") // Add this validation
          .optional()
          .isIn(["paid", "partial", "pending"])
          .withMessage("Invalid payment status"),

        query("date").optional().isDate().withMessage("Invalid date format"),

        validatorMiddleware,
      ];
    }
  }
};