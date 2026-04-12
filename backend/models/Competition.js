const mongoose = require('mongoose');

const scoringCriteriaSchema = new mongoose.Schema({
  key: String,
  label: String,
  labelEn: String,
  type: { type: String, enum: ['number', 'boolean', 'time'], default: 'number' },
  points: { type: Number, default: 0 },
  pointsPerUnit: { type: Number, default: 0 },
  maxValue: Number,
  isBonus: { type: Boolean, default: false },
  isPenalty: { type: Boolean, default: false },
  description: String
}, { _id: false });

const competitionSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  nameEn: { type: String, trim: true },
  description: String,
  category: {
    type: String,
    enum: ['manual', 'autonomous', 'battle', 'line_following'],
    required: true
  },
  ageGroup: {
    type: String,
    enum: ['≤12', '≤15', '≤18', 'open'],
    required: true
  },
  scoringType: {
    type: String,
    enum: ['POINT', 'TIME', 'BATTLE'],
    required: true
  },
  rankingMethod: {
    type: String,
    enum: ['SUM', 'BEST', 'LAST'],
    default: 'SUM'
  },
  totalRounds: { type: Number, default: 3 },
  timePerRoundSeconds: { type: Number, default: 180 },
  setupTimeSeconds: { type: Number, default: 30 },
  scoringCriteria: [scoringCriteriaSchema],
  maxTeams: { type: Number, default: 50 },
  status: {
    type: String,
    enum: ['upcoming', 'registration', 'active', 'completed'],
    default: 'upcoming'
  },
  currentRound: { type: Number, default: 0 },
  venue: String,
  notes: String,
  sortOrder: { type: Number, default: 99 }
}, {
  timestamps: true
});

module.exports = mongoose.model('Competition', competitionSchema);
