const mongoose = require('mongoose');
const crypto = require('crypto');
const { ERROR_TYPES, CONCEPT_TAGS, DIAGNOSTIC_STATUSES } = require('../config/constants');

// Read-only model owned by Code Coach team
const CodeDiagnosticSchema = new mongoose.Schema({
    diagnosticId: { type: String, unique: true, default: () => crypto.randomUUID() },
    userId: { type: String, required: true, index: true },
    learningSessionId: { type: String, index: true },
    errorType: { type: String, enum: ERROR_TYPES },
    conceptTag: { type: String, enum: CONCEPT_TAGS, index: true },
    explanationKey: { type: String },
    line: { type: Number },
    column: { type: Number },
    severity: { type: String, default: 'warning' },
    confidence: { type: Number, min: 0, max: 1 },
    mlProbability: { type: Number, min: 0, max: 1 },
    locatorConfidence: { type: Number, min: 0, max: 1 },
    detectionEngine: { type: String, default: 'ml_ast_hybrid' },
    status: { type: String, enum: DIAGNOSTIC_STATUSES, default: 'active', index: true },
    codeContextHash: { type: String },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null }
}, { collection: 'codeDiagnostics' });

CodeDiagnosticSchema.index({ userId: 1, conceptTag: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('CodeDiagnostic', CodeDiagnosticSchema);
