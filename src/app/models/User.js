const {default: mongoose} = require('mongoose');
const Schema = mongoose.Schema;

const User = new Schema({
    name:{
        type: String,
        required: true
    },
    email:{
        type: String,
        required: true
    },
    wallet:{
        type: Number
    }
})
module.exports = mongoose.model('User', User);