const showtimeRouter = require('./showtime');

function route(app){
    app.use('/showtime', showtimeRouter )
}
module.exports = route