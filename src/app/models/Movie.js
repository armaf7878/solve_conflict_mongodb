const {default: mongoose} = require('mongoose');
const Schema = mongoose.Schema;

const Movie = new Schema({
    title:{
        type: String,
        required: true
    },
    duration:{
        type: Number,
        required: true
    },
    genre:{
        type: String,
        required: true
    }
});
module.exports = mongoose.model('Movie', Movie);