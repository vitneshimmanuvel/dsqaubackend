const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  item: {
    type: String,
    required: [true, 'Material item name is required'],
    trim: true
  },
  supplier: {
    type: String,
    required: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true,
    enum: ['Bags', 'kg', 'Trucks', 'cft', 'Pieces', 'Liters', 'Meters']
  },
  status: {
    type: String,
    enum: ['Pending', 'Dispatched', 'Delivered'],
    default: 'Pending'
  },
  date: {
    type: Date,
    default: Date.now
  },
  cost: {
    type: Number,
    required: true,
    min: 0
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  notes: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Material', materialSchema);
