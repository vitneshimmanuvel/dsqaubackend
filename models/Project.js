const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['Completed', 'In Progress', 'Pending'],
    default: 'Pending'
  },
  description: String
});

const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['PDF', 'DWG', 'IMG', 'XLS', 'DOC'],
    default: 'PDF'
  },
  url: { type: String, required: true },
  publicId: String, // Cloudinary public ID
  size: String,
  uploadedAt: { type: Date, default: Date.now }
});

const invoiceSchema = new mongoose.Schema({
  number: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ['Paid', 'Pending', 'Overdue'],
    default: 'Pending'
  },
  stage: String
});

const budgetItemSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['Materials', 'Labor', 'Equipment', 'Overhead'],
    required: true
  },
  description: String,
  amount: { type: Number, required: true }
});

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true
  },
  clientName: {
    type: String,
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  location: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Planning', 'Foundation', 'Structure', 'Finishing', 'Completed'],
    default: 'Planning'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  deadline: {
    type: Date,
    required: true
  },
  budget: {
    type: Number,
    required: true
  },
  spent: {
    type: Number,
    default: 0
  },
  budgetPlan: [budgetItemSchema],
  thumbnail: {
    type: String,
    default: 'https://images.unsplash.com/photo-1600596542815-2ad4d9a44566?auto=format&fit=crop&w=600&q=80'
  },
  description: {
    type: String,
    default: ''
  },
  milestones: [milestoneSchema],
  documents: [documentSchema],
  invoices: [invoiceSchema],
  gallery: [String],
  assignedAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Project', projectSchema);
