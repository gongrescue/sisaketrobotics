const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: true
  },
  round: { type: Number, required: true, min: 1 },

  // Flexible scoring details (varies by competition type)
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Computed total score
  totalScore: { type: Number, default: 0 },

  // Bonus score (special score added on top)
  bonusScore: { type: Number, default: 0 },

  // Time used (for time-based and as tiebreaker)
  timeUsedSeconds: { type: Number, default: 0 },

  // For TIME scoring: task completed or not
  taskCompleted: { type: Boolean, default: false },

  // Distance for partial completion (Line Fast)
  distanceCm: { type: Number, default: 0 },

  // Number of retries used
  retries: { type: Number, default: 0 },

  // Score validity
  isValid: { type: Boolean, default: true },
  disqualified: { type: Boolean, default: false },
  disqualificationReason: String,

  // ผู้บันทึกคะแนนครั้งแรก (set on insert เท่านั้น)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // ผู้แก้ไขล่าสุด (update ทุกครั้งที่บันทึก/แก้ไข)
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // เก็บไว้เพื่อ backward-compat (alias ของ lastEditedBy)
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  notes: String
}, {
  timestamps: true
});

// One score per team per round per competition
scoreSchema.index({ team: 1, competition: 1, round: 1 }, { unique: true });

module.exports = mongoose.model('Score', scoreSchema);
