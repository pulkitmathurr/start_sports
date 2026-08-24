const publicService = require('./public.service');
const { successResponse, errorResponse } = require('../../utils/response');

const getFacilities = async (req, res, next) => {
  try {
    const facilities = await publicService.getFacilities();
    return res.json(successResponse('Facilities fetched', facilities));
  } catch (err) { next(err); }
};

const getFacilityBySlug = async (req, res, next) => {
  try {
    const facility = await publicService.getFacilityBySlug(req.params.slug);
    if (!facility) return res.status(404).json({ success: false, message: 'Facility not found' });
    return res.json(successResponse('Facility fetched', facility));
  } catch (err) { next(err); }
};

module.exports = { getFacilities, getFacilityBySlug };