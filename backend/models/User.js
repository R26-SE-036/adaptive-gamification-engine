const mongoose = require('mongoose');

// CORRECTION 6: Read-only model owned by Code Coach team
const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    fullName: { type: String }
    // Other fields exist but we only read what we need
}, { collection: 'users', read: 'primary' }); // ensure we read from correct collection

module.exports = mongoose.model('User', UserSchema);
