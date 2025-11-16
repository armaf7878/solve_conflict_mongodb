const mongoose = require('mongoose');
const Ticket = require('../../app/models/Ticket')
async function connect(){
    try {
        await mongoose.connect("mongodb://localhost:27017/cinema_solve_conflict");
        await Ticket.syncIndexes();
        console.log("Connected successfully");
    } catch (error) {
        console.log('Connection Failed:', error.message);
    }
}
module.exports = {connect};