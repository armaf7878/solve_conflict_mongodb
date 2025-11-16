const cron = require('node-cron');
const {expireTicket} = require('./TicketController')

cron.schedule("*/10 * * * * *", () => {
    console.log("CRON JOB: Đang kiểm tra vé hết hạn");
    expireTicket();
})