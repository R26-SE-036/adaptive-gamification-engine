const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    studentNumber: { type: String },
    fullName: { type: String },
    email: { type: String, required: true, unique: true, index: true },
    role: { type: String, default: 'student' },
    passwordHash: { type: String },
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
}, { collection: 'users' });

module.exports = mongoose.model('User', UserSchema);
