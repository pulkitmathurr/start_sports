const express    = require('express');
const router     = express.Router();
const auth       = require('../../middlewares/auth.middleware');
const controller = require('./customer.controller');

// All routes protected by auth
router.get('/',                            auth, controller.getCustomersPage);
router.post('/',                           auth, controller.createCustomer);
router.get('/search',                      auth, controller.searchCustomers);   // ← must be before /:customerId
router.get('/:customerId',                 auth, controller.getCustomerProfilePage);
router.post('/:customerId/address',        auth, controller.updateAddress);
router.put('/:customerId',                 auth, controller.updateCustomer);

module.exports = router;