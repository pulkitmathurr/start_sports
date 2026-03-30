const settingsService     = require('./settings.service');
const { successResponse } = require('../../utils/response');

// ── GET /settings — Settings Page ────────────────
const getSettingsPage = async (req, res, next) => {
    try {
        const settings = await settingsService.getSettings();
        return res.render('settings/ground', {
            title:      'Ground Settings',
            activePage: 'settings',
            settings,
            success:    req.query.success || null,
            error:      null
        });
    } catch (error) { next(error); }
};

// ── POST /settings/update — Save Settings ─────────
const updateSettings = async (req, res, next) => {
    try {
        await settingsService.updateSettings({
            ground_name:           req.body.ground_name,
            ground_address:        req.body.ground_address,
            ground_phone:          req.body.ground_phone,
            open_time:             req.body.open_time,
            close_time:            req.body.close_time,
            slot_duration:         parseInt(req.body.slot_duration),
            peak_start_time:       req.body.peak_start_time,
            peak_end_time:         req.body.peak_end_time,
            peak_price:            parseFloat(req.body.peak_price),
            off_peak_price:        parseFloat(req.body.off_peak_price),
            advance_booking_days:  parseInt(req.body.advance_booking_days),
            advance_payment_hours: parseInt(req.body.advance_payment_hours)
        });
        await settingsService.deleteFutureSlots();
        return res.redirect('/settings?success=1');
    } catch (error) { next(error); }
};

// ── GET /settings/peak-suggestion/pending ─────────
// Returns all grounds with a pending suggestion
const getPendingSuggestion = async (req, res, next) => {
    try {
        const suggestions = await settingsService.getPendingSuggestion();
        return res.status(200).json(successResponse('OK', suggestions));
    } catch (e) { next(e); }
};

// ── POST /settings/:ground_id/peak-suggestion/accept
const acceptSuggestion = async (req, res, next) => {
    try {
        await settingsService.acceptSuggestion(req.params.ground_id);
        return res.status(200).json(successResponse('Peak hours updated'));
    } catch (e) { next(e); }
};

// ── POST /settings/:ground_id/peak-suggestion/dismiss
const dismissSuggestion = async (req, res, next) => {
    try {
        await settingsService.dismissSuggestion(req.params.ground_id);
        return res.status(200).json(successResponse('Suggestion dismissed'));
    } catch (e) { next(e); }
};

module.exports = {
    getSettingsPage,
    updateSettings,
    getPendingSuggestion,
    acceptSuggestion,
    dismissSuggestion
};