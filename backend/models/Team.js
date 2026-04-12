const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  role: { type: String, enum: ['competitor', 'coach'], default: 'competitor' }
}, { _id: false });

const teamSchema = new mongoose.Schema({
  teamNumber: { type: String, required: true, trim: true },
  teamName: { type: String, required: true, trim: true },
  schoolName: { type: String, required: true, trim: true },
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: true
  },
  members: [memberSchema],
  coachName: { type: String, trim: true },
  contactPhone: String,
  province: { type: String, default: 'ศรีสะเกษ' },
  status: {
    type: String,
    enum: ['registered', 'competing', 'eliminated', 'qualified', 'winner'],
    default: 'registered'
  },
  notes: String,
  checkedIn: { type: Boolean, default: false },
  checkedInAt: Date
}, {
  timestamps: true
});

// Unique team number per competition
teamSchema.index({ competition: 1, teamNumber: 1 }, { unique: true });

module.exports = mongoose.model('Team', teamSchema);
