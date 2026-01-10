const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['Credit', 'Debit'],
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed'],
    default: 'Pending'
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  category: {
    type: String,
    enum: ['Payment', 'Material', 'Wages', 'Equipment', 'Overhead', 'Other'],
    default: 'Other'
  },
  reference: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);
