import mongoose from 'mongoose';

const { Schema } = mongoose;
const options = { timestamps: true, versionKey: false };

export const Project = mongoose.model(
  'Project',
  new Schema(
    {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      description: { type: String, trim: true, maxlength: 1000, default: '' },
    },
    options,
  ),
);

export const EventSchema = mongoose.model(
  'EventSchema',
  new Schema(
    {
      projectId: { type: Schema.Types.ObjectId, required: true, index: true },
      eventName: { type: String, required: true, trim: true, maxlength: 160 },
      version: { type: Number, required: true, min: 1 },
      schema: { type: Schema.Types.Mixed, required: true },
    },
    options,
  ).index({ projectId: 1, eventName: 1, version: 1 }, { unique: true }),
);

export const Consumer = mongoose.model(
  'Consumer',
  new Schema(
    {
      projectId: { type: Schema.Types.ObjectId, required: true, index: true },
      name: { type: String, required: true, trim: true, maxlength: 120 },
      eventName: { type: String, required: true, trim: true },
      expectedSchemaVersion: { type: Number, required: true, min: 1 },
      handler: {
        type: String,
        required: true,
        enum: ['order-validation', 'payment-amount', 'inventory-quantity'],
      },
      enabled: { type: Boolean, default: true },
      invariants: { type: [Schema.Types.Mixed], default: [] },
    },
    options,
  ).index({ projectId: 1, name: 1 }, { unique: true }),
);

export const EventFixture = mongoose.model(
  'EventFixture',
  new Schema(
    {
      projectId: { type: Schema.Types.ObjectId, required: true, index: true },
      eventName: { type: String, required: true, trim: true },
      schemaVersion: { type: Number, required: true, min: 1 },
      payload: { type: Schema.Types.Mixed, required: true },
      description: { type: String, trim: true, maxlength: 500, default: '' },
    },
    options,
  ).index(
    { projectId: 1, eventName: 1, schemaVersion: 1, description: 1 },
    { unique: true },
  ),
);

export const TestRun = mongoose.model(
  'TestRun',
  new Schema(
    {
      projectId: { type: Schema.Types.ObjectId, required: true, index: true },
      eventName: { type: String, required: true },
      fromVersion: { type: Number, required: true },
      toVersion: { type: Number, required: true },
      status: {
        type: String,
        enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
        default: 'queued',
        index: true,
      },
      attempts: { type: Number, default: 0 },
      outcome: {
        type: String,
        enum: ['pass', 'warning', 'fail'],
        default: null,
      },
      inputSnapshot: { type: Schema.Types.Mixed, required: true },
      results: { type: [Schema.Types.Mixed], default: [] },
      summary: { type: Schema.Types.Mixed, default: {} },
      startedAt: Date,
      completedAt: Date,
      durationMs: Number,
      errorMessage: String,
    },
    options,
  ).index({ projectId: 1, createdAt: -1 }),
);
