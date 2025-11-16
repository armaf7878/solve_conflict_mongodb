const {default: mongoose} = require('mongoose');
const Schema = mongoose.Schema;

const Ticket = new Schema({
    user_id:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    showtime_id:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'Showtime',
        required: true
    },
    seat_id:{
        type: String,
        required: true
    },
    price:{
        type: Number,
        required: true
    },
    status:{
        type: String, 
        enum: ['pending_payment', 'paid', 'canceled', 'refund'],
        default: 'pending_payment',
        required: true
    },
    version: { 
        type: Number,
         default: 0 }
},{
    timestamps: true
});

Ticket.index(
//   { user_id: 1, showtime_id: 1, seat_id: 1 },
  { showtime_id: 1, seat_id: 1 },
  { unique: true }
);

module.exports = mongoose.model('Ticket', Ticket);