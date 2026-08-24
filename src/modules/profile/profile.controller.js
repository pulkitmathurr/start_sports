const profileService = require('./profile.service');
const { successResponse } = require('../../utils/response');

// ── GET /profile ──────────────────────────────────
const getProfilePage = async (req, res, next) => {
    try {
        const profile = await profileService.getProfile({
            user_id: req.user.user_id,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });

        return res.render('profile/index', {
            title:      'My Profile',
            activePage: 'profile',
            profile,
            success:    req.query.success || null,
            error:      null,
            user: res.locals.user,
            tenant: req.tenant
        });

    } catch (error) {
        next(error);
    }
};

// ── POST /profile/update ──────────────────────────
const updateProfile = async (req, res, next) => {
    try {
        await profileService.updateProfile({
            user_id: req.user.user_id,
            name:    req.body.name,
            email:   req.body.email,
            phone:   req.body.phone,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });

        return res.redirect('/profile?success=profile');

    } catch (error) {
        if (error.statusCode === 409) {
            const profile = await profileService.getProfile({ 
                user_id: req.user.user_id,
                tenant_id: req.tenant ? req.tenant.id : null,
                user_role: req.user.role
            });
            return res.render('profile/index', {
                title: 'My Profile', 
                activePage: 'profile',
                profile, 
                success: null, 
                error: error.message,
                user: res.locals.user,
                tenant: req.tenant
            });
        }
        next(error);
    }
};

// ── POST /profile/upload-image ────────────────────
const uploadImage = async (req, res, next) => {
    try {
        // Multer already saved file — req.file has the info
        if (!req.file) {
            const profile = await profileService.getProfile({ 
                user_id: req.user.user_id,
                tenant_id: req.tenant ? req.tenant.id : null,
                user_role: req.user.role
            });
            return res.render('profile/index', {
                title: 'My Profile', 
                activePage: 'profile',
                profile, 
                success: null, 
                error: 'Please select an image to upload',
                user: res.locals.user,
                tenant: req.tenant
            });
        }

        await profileService.updateProfileImage({
            user_id:  req.user.user_id,
            filename: req.file.filename,
            tenant_id: req.tenant ? req.tenant.id : null,
            user_role: req.user.role
        });

        return res.redirect('/profile?success=image');

    } catch (error) {
        next(error);
    }
};

// ── POST /profile/change-password ────────────────
const changePassword = async (req, res, next) => {
    try {
        await profileService.changePassword({
            user_id:          req.user.user_id,
            current_password: req.body.current_password,
            new_password:     req.body.new_password,
            tenant_id:        req.tenant ? req.tenant.id : null,
            user_role:        req.user.role
        });

        return res.redirect('/profile?success=password');

    } catch (error) {
        if (error.statusCode === 400 || error.statusCode === 403) {
            const profile = await profileService.getProfile({ 
                user_id: req.user.user_id,
                tenant_id: req.tenant ? req.tenant.id : null,
                user_role: req.user.role
            });
            return res.render('profile/index', {
                title: 'My Profile', 
                activePage: 'profile',
                profile, 
                success: null, 
                error: error.message,
                user: res.locals.user,
                tenant: req.tenant
            });
        }
        next(error);
    }
};

module.exports = { getProfilePage, updateProfile, uploadImage, changePassword };