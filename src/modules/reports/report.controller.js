const reportService = require("./report.service");

const getReportPage = async (req, res, next) => {
    try {
        const specific_date = req.query.specific_date || null;
        const preset        = specific_date ? null : req.query.preset || "this_month";
        const date_from     = specific_date || req.query.date_from || null;
        const date_to       = specific_date || req.query.date_to   || null;
        const ground_id     = req.query.ground_id || null;

        const grounds = await reportService.getGrounds(
            req.tenant ? req.tenant.id : null,
            req.user.role
        );

        const data = await reportService.getReportData({
            preset,
            date_from,
            date_to,
            ground_id,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });

        return res.render("reports/index", {
            title:      "Reports",
            activePage: "reports",
            grounds,
            data,
            filters: { preset, date_from, date_to, ground_id, specific_date },
            tenant: req.tenant
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getReportPage };