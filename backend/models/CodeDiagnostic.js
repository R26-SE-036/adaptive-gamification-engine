const mongoose = require('mongoose');

// Read-only model owned by Code Coach team
const CodeDiagnosticSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    learningSessionId: { type: String },
    errorType: { type: String },
    conceptTag: { type: String },
    status: { type: String },
    createdAt: { type: Date }
}, { collection: 'codeDiagnostics' });

module.exports = mongoose.model('CodeDiagnostic', CodeDiagnosticSchema);
