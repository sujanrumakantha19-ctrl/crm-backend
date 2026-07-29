const mongoose = require('mongoose');
const Counter = require('./Counter');

const ProjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a project name'],
    },
    displayId: {
      type: String,
      unique: true,
      sparse: true,
    },
    location: {
      type: String,
      required: [true, 'Please add a location'],
    },
    description: {
      type: String,
    },
    status: {
      type: String,
      enum: ['Upcoming', 'Active', 'Completed', 'On Hold'],
      default: 'Upcoming',
    },
    totalLandArea: {
      type: Number,
      required: [true, 'Please add total land area'],
    },
    landAreaUnit: {
      type: String,
      default: 'Acres',
    },
    surveyNumber: {
      type: String,
    },
    village: {
      type: String,
    },
    mandal: {
      type: String,
    },
    district: {
      type: String,
    },
    landType: {
      type: String,
      enum: ['Agricultural', 'Residential', 'Commercial', 'Mixed'],
    },
    totalPlots: {
      type: Number,
      required: [true, 'Please add total number of plots'],
    },
    plotSize: {
      type: Number,
    },
    plotSizeUnit: {
      type: String,
      default: 'Sq Yards',
    },
    roadFacingPlots: {
      type: Number,
    },
    cornerPlots: {
      type: Number,
    },
    pricePerSqUnit: {
      type: Number,
    },
    images: {
      type: [String],
    },
    latitude: {
      type: String,
    },
    longitude: {
      type: String,
    },
    category: {
      type: String,
      enum: ['Open Plots', 'Villas', 'Apartments', 'Commercial', 'Farm Land'],
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    plotImages: {
      type: [String],
    },
    owner: {
      name: { type: String },
      phone: { type: String },
      email: { type: String },
      address: { type: String },
      kycDocuments: [
        {
          id: { type: String },
          name: { type: String },
          path: { type: String },
          type: { type: String, enum: ['Image', 'PDF', 'KYC'] },
          uploadedAt: { type: String },
        },
      ],
    },
    sellers: [
      {
        name: { type: String },
        phone: { type: String },
        email: { type: String },
        address: { type: String },
        kycDocuments: [
          {
            id: { type: String },
            name: { type: String },
            path: { type: String },
            type: { type: String, enum: ['Image', 'PDF', 'KYC'] },
            uploadedAt: { type: String },
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

ProjectSchema.index({ status: 1 });
ProjectSchema.index({ isEnabled: 1 });
ProjectSchema.index({ category: 1 });

// Auto-generate displayId (atomic to prevent race conditions)
ProjectSchema.pre('save', async function () {
  if (this.isModified('displayId')) return;
  if (!this.displayId) {
    const Counter = mongoose.model('Counter');
    const counter = await Counter.findOneAndUpdate(
      { name: 'displayId_PROJ' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    this.displayId = `PROJ-${counter.seq}`;
  }
});

// Virtual for available plots count
ProjectSchema.virtual('availablePlots', {
  ref: 'Plot',
  localField: '_id',
  foreignField: 'projectId',
  match: { status: 'Available' },
  count: true
});

module.exports = mongoose.model('Project', ProjectSchema);