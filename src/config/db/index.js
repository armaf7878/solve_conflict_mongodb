const mongoose = require('mongoose');

async function connect(){
    try {
        await mongoose.connect("mongodb://localhost:27017/cinema_solve_conflict");
        console.log("Connected successfully");
    } catch (error) {
        console.log('Connection Failed:', error.message);
    }
}
module.exports = {connect};