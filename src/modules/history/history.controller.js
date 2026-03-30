const historyService = require('./history.service');

// ── GET /history ──
const getHistoryPage = async (req, res, next) => {
    try {
        const grounds = await historyService.getAllGrounds();
        return res.render('history/index', {
            title: 'Booking History',
            activePage: 'history',
            grounds
        });
    } catch (error) { next(error); }
};

// ── GET /history/:groundId ──
const getGroundHistoryPage = async (req, res, next) => {
    try {
        const ground_id = req.params.groundId;
        const status    = req.query.status    || null;
        const date_from = req.query.date_from || null;
        const date_to   = req.query.date_to   || null;
        const search    = req.query.search    || null;
        const page      = parseInt(req.query.page)  || 1;
        const limit     = parseInt(req.query.limit) || 10;
        const offset    = (page - 1) * limit;

        const { ground, bookings, stats } = await historyService.getGroundHistory({
            ground_id, status, date_from, date_to, search, limit, offset
        });

        const totalRecords = await historyService.getTotalHistoryCount({ ground_id, status, date_from, date_to, search });
        const totalPages   = Math.ceil(totalRecords / limit);

        const buildPaginationUrl = (pageNum) => {
            const params = new URLSearchParams();
            if (status)    params.append('status',    status);
            if (search)    params.append('search',    search);
            if (date_from) params.append('date_from', date_from);
            if (date_to)   params.append('date_to',   date_to);
            if (limit)     params.append('limit',     limit);
            params.append('page', pageNum);
            return `/history/${ground_id}?${params.toString()}`;
        };

        return res.render('history/ground', {
            title: `History — ${ground.name}`,
            activePage: 'history',
            ground,
            bookings,
            stats,
            filters: { status, date_from, date_to, search },
            pagination: {
                currentPage:  page,
                totalPages:   totalPages,
                totalRecords: totalRecords,
                limit:        limit,
                offset:       offset
            },
            buildPaginationUrl
        });
    } catch (error) { next(error); }
};

// ── POST /history/booking/:id/delete ─────────────
const softDeleteBooking = async (req, res, next) => {
    try {
        await historyService.softDeleteBooking(req.params.id);
        return res.status(200).json({ success: true, message: 'Booking deleted' });
    } catch (error) { next(error); }
};

module.exports = { getHistoryPage, getGroundHistoryPage, softDeleteBooking };