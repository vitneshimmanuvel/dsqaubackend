const mongoose = require('mongoose');

const workerLogSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ['Mason', 'Helper', 'Electrician', 'Plumber', 'Carpenter', 'Manager', 'Painter', 'Tile Worker', 'Bar Bender', 'Labor']
  },
  count: {
    type: Number,
    required: true,
    min: 1
  },
  shift: {
    type: String,
    enum: ['Morning', 'Evening', 'Night'],
    default: 'Morning'
  },
  date: {
    type: Date,
    default: Date.now
  },
  hoursWorked: {
    type: Number,
    default: 8
  },
  ratePerWorker: {
    type: Number,
    required: true
  },
  totalWage: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Paid'],
    default: 'Pending'
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  notes: String
}, {
  timestamps: true
});

// Calculate total wage before saving
workerLogSchema.pre('save', function(next) {
  if (this.isModified('count') || this.isModified('ratePerWorker')) {
    this.totalWage = this.count * this.ratePerWorker;
  }
  next();
});

module.exports = mongoose.model('WorkerLog', workerLogSchema);
