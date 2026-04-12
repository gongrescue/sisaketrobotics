const mongoose = require('mongoose');

// For BATTLE format competitions (e.g., หุ่นยนต์เลี้ยงวัว)
const matchSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: true
  },
  matchNumber: { type: Number, required: true },
  stage: {
    type: String,
    enum: ['preliminary', 'round16', 'quarterfinal', 'semifinal', 'final', 'third_place'],
    default: 'preliminary'
  },
  round: { type: Number, default: 1 },

  team1: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  team2: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },

  team1Score: { type: Number, default: 0 },
  team2Score: { type: Number, default: 0 },

  // For เลี้ยงวัว: detailed scoring
  team1Details: { type: mongoose.Schema.Types.Mixed, default: {} },
  team2Details: { type: mongoose.Schema.Types.Mixed, default: {} },

  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  isDraw: { type: Boolean, default: false },

  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },

  scheduledTime: Date,
  startedAt: Date,
  completedAt: Date,

  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Match', matchSchema);
