const express = require('express')
const router = express.Router()
const ticketController = require('../app/controllers/TicketController')

router.post('/create', ticketController.create);
router.get('/payment/:id', ticketController.payment)

module.exports = router;