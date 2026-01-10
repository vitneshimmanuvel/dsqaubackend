const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Vendor name is required'],
    trim: true
  },
  contactPerson: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  specialty: {
    type: String,
    enum: ['Cement', 'Steel', 'Sand', 'Wood', 'Electrical', 'Plumbing', 'Paint', 'General'],
    default: 'General'
  },
  location: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Vendor', vendorSchema);
