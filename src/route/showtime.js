const express = require('express');
const router = express.Router();
const showtimeController = require('../app/controllers/ShowtimeController');

router.get('/showall', showtimeController.showall);
router.get('/delete/:id', showtimeController.delete);

module.exports = router;