const {default: mongoose} = require('mongoose')
const Schema = mongoose.Schema;

const Showtime = new Schema({
    movie_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref:'Movie',
        required: true
    },
    room:{
        type: String, 
        required: true
    },
    start_time:{
        type: Date,
        required: true
    },
    seats:[
        {
            seat_id: { type: String, required: true },
            status: { type: String, required: true }
        }
    ],
    status:{
        type: String,
        enum: ['Active', 'Canceled', 'Locked'],
        default: "Active",
        required: true
    }

},{
    timestamps: true
});

module.exports = mongoose.model('Showtime', Showtime);