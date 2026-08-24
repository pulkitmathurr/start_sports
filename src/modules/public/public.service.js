const db = require('../../config/db.config');

const getFacilities = async () => {
  const [rows] = await db.promise().query(`
    SELECT 
      t.id, t.business_name, t.slug, t.city, t.status,
      COUNT(g.id) AS total_grounds
    FROM tbl_tenants t
    LEFT JOIN tbl_grounds g ON g.tenant_id = t.id AND g.flag = 0 AND g.status = 'active'
    WHERE t.status = 'active'
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `);
  return rows;
};

const getFacilityBySlug = async (slug) => {
  const [[facility]] = await db.promise().query(`
    SELECT t.id, t.business_name, t.slug, t.city
    FROM tbl_tenants t
    WHERE t.slug = ? AND t.status = 'active'
    LIMIT 1
  `, [slug]);

  if (!facility) return null;

 const [grounds] = await db.promise().query(`
    SELECT id, name, sport_type, peak_price, off_peak_price, address, amenities, status
    FROM tbl_grounds
    WHERE tenant_id = ? AND flag = 0 AND status = 'active'
`, [facility.id]);

  return { ...facility, grounds };
};

module.exports = { getFacilities ,getFacilityBySlug};