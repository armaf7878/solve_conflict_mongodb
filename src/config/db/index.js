const mongoose = require('mongoose');
const Ticket = require('../../app/models/Ticket')
const MongoDBTRA = "mongodb://127.0.0.1:27018/?replicaSet=rs0"
const MONGODB_URI ="mongodb://localhost:27017/cinema_solve_conflict" 


async function connect(uri = MongoDBTRA){ // Sử dụng giá trị mặc định
    try {
        console.log("Connecting to:", uri); 
        await mongoose.connect(uri);
        await Ticket.syncIndexes();
        console.log("Connected successfully");
    } catch (error) {
        console.log('Connection Failed:', error.message);
    }
}
module.exports = {connect};
