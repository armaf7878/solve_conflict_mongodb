const showtimeRouter = require('./showtime');
const ticketRouter = require('./ticket')
function route(app){
    app.use('/showtime', showtimeRouter ),
    app.use('/ticket', ticketRouter)
}
module.exports = route