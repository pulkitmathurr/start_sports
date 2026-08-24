const db     = require('../../config/db.config');
const bcrypt = require('bcrypt');
const fs     = require('fs');
const path   = require('path');

// ── Get Profile ───────────────────────────────────
const getProfile = async ({ user_id, tenant_id = null, user_role = 'admin' }) => {
    try {
        let query = 'SELECT id, name, email, phone, profile_image, created_at, role FROM tbl_users WHERE id = ? LIMIT 1';
        let params = [user_id];

        // For admin users, verify they belong to the tenant
        if (user_role === 'admin' && tenant_id) {
            const [tenantCheck] = await db.promise().query(
                'SELECT user_id FROM tbl_tenants WHERE id = ? AND user_id = ?',
                [tenant_id, user_id]
            );
            
            if (tenantCheck.length === 0) {
                const err = new Error('Unauthorized access to profile');
                err.statusCode = 403;
                throw err;
            }
        }

        const [rows] = await db.promise().query(query, params);

        if (rows.length === 0) {
            const err = new Error('User not found');
            err.statusCode = 404;
            throw err;
        }

        return rows[0];
    } catch (err) {
        throw err;
    }
};

// ── Update Name & Email ───────────────────────────
const updateProfile = async ({ user_id, name, email, phone, tenant_id = null, user_role = 'admin' }) => {
    try {
        // Verify admin users belong to this tenant
        if (user_role === 'admin' && tenant_id) {
            const [tenantCheck] = await db.promise().query(
                'SELECT user_id FROM tbl_tenants WHERE id = ? AND user_id = ?',
                [tenant_id, user_id]
            );
            
            if (tenantCheck.length === 0) {
                const err = new Error('Unauthorized to update this profile');
                err.statusCode = 403;
                throw err;
            }
        }

        // Check if email is already used by another user
        let emailCheckQuery = 'SELECT id FROM tbl_users WHERE email = ? AND id != ? LIMIT 1';
        let emailCheckParams = [email, user_id];

        const [existing] = await db.promise().query(emailCheckQuery, emailCheckParams);

        if (existing.length > 0) {
            const err = new Error('This email is already in use by another account');
            err.statusCode = 409;
            throw err;
        }

        await db.promise().query(
            'UPDATE tbl_users SET name = ?, email = ?, phone = ? WHERE id = ?',
            [name, email, phone || null, user_id]
        );

        return true;
    } catch (err) {
        throw err;
    }
};

// ── Upload Profile Image ──────────────────────────
const updateProfileImage = async ({ user_id, filename, tenant_id = null, user_role = 'admin' }) => {
    try {
        // Verify admin users belong to this tenant
        if (user_role === 'admin' && tenant_id) {
            const [tenantCheck] = await db.promise().query(
                'SELECT user_id FROM tbl_tenants WHERE id = ? AND user_id = ?',
                [tenant_id, user_id]
            );
            
            if (tenantCheck.length === 0) {
                const err = new Error('Unauthorized to update this profile');
                err.statusCode = 403;
                throw err;
            }
        }

        // Get old image to delete it
        const [rows] = await db.promise().query(
            'SELECT profile_image FROM tbl_users WHERE id = ? LIMIT 1',
            [user_id]
        );

        const oldImage = rows[0]?.profile_image;

        // Save new filename to DB
        await db.promise().query(
            'UPDATE tbl_users SET profile_image = ? WHERE id = ?',
            [filename, user_id]
        );

        // Delete old image file if it exists
        if (oldImage) {
            const oldPath = path.join(__dirname, '../../public/uploads/avatars', oldImage);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        return filename;
    } catch (err) {
        throw err;
    }
};

// ── Change Password ───────────────────────────────
const changePassword = async ({ user_id, current_password, new_password, tenant_id = null, user_role = 'admin' }) => {
    try {
        // Verify admin users belong to this tenant
        if (user_role === 'admin' && tenant_id) {
            const [tenantCheck] = await db.promise().query(
                'SELECT user_id FROM tbl_tenants WHERE id = ? AND user_id = ?',
                [tenant_id, user_id]
            );
            
            if (tenantCheck.length === 0) {
                const err = new Error('Unauthorized to change this password');
                err.statusCode = 403;
                throw err;
            }
        }

        const [rows] = await db.promise().query(
            'SELECT password FROM tbl_users WHERE id = ? LIMIT 1',
            [user_id]
        );

        if (rows.length === 0) {
            const err = new Error('User not found');
            err.statusCode = 404;
            throw err;
        }

        const isMatch = await bcrypt.compare(current_password, rows[0].password);
        if (!isMatch) {
            const err = new Error('Current password is incorrect');
            err.statusCode = 400;
            throw err;
        }

        const hashed = await bcrypt.hash(new_password, 12);
        await db.promise().query(
            'UPDATE tbl_users SET password = ? WHERE id = ?',
            [hashed, user_id]
        );

        return true;
    } catch (err) {
        throw err;
    }
};

module.exports = { getProfile, updateProfile, updateProfileImage, changePassword };