import mongoose from 'mongoose';
import { handlerNames, validateInvariants } from './handlers.js';

const { Schema } = mongoose;
const options = { timestamps: true, versionKey: false };

export const Project = mongoose.model(
  'Project',
  new Schema(
    {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      description: { type: String, trim: true, maxlength: 1000, default: '' },
      deleting: { type: Boolean, default: false, select: false },
    },
    options,
  ),
);

export const EventSchema = mongoose.model(
  'EventSchema',
  new Schema(
    {
      projectId: {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true,
      },
      eventName: { type: String, required: true, trim: true, maxlength: 160 },
      version: {
        type: Number,
        required: true,
        min: 1,
        validate: {
          validator: Number.isSafeInteger,
          message: 'version must be a positive integer.',
        },
      },
      schemaDefinition: {
        type: Schema.Types.Mixed,
        required: true,
        validate: {
          validator: (value) =>
            Boolean(
              value && typeof value === 'object' && !Array.isArray(value),
            ),
          message: 'schemaDefinition must be a JSON object.',
        },
      },
    },
    options,
  ).index({ projectId: 1, eventName: 1, version: 1 }, { unique: true }),
);

export const Consumer = mongoose.model(
  'Consumer',
  new Schema(
    {
      projectId: {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true,
      },
      name: { type: String, required: true, trim: true, maxlength: 120 },
      eventName: { type: String, required: true, trim: true },
      expectedSchemaVersion: {
        type: Number,
        required: true,
        min: 1,
        validate: {
          validator: Number.isSafeInteger,
          message: 'expectedSchemaVersion must be a positive integer.',
        },
      },
      handlerType: {
        type: String,
        required: true,
        enum: handlerNames,
      },
      enabled: { type: Boolean, default: true },
      invariants: {
        type: [Schema.Types.Mixed],
        default: [],
        validate: {
          validator: (value) => {
            try {
              validateInvariants(value);
              return true;
            } catch {
              return false;
            }
          },
          message: 'invariants must use supported declarative checks.',
        },
      },
    },
    options,
  ).index({ projectId: 1, name: 1 }, { unique: true }),
);

export const EventFixture = mongoose.model(
  'EventFixture',
  new Schema(
    {
      projectId: {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true,
      },
      eventName: { type: String, required: true, trim: true },
      schemaVersion: {
        type: Number,
        required: true,
        min: 1,
        validate: {
          validator: Number.isSafeInteger,
          message: 'schemaVersion must be a positive integer.',
        },
      },
      payload: {
        type: Schema.Types.Mixed,
        required: true,
        validate: {
          validator: (value) =>
            Boolean(
              value && typeof value === 'object' && !Array.isArray(value),
            ),
          message: 'payload must be a JSON object.',
        },
      },
      description: { type: String, trim: true, maxlength: 500, default: '' },
    },
    options,
  ),
);

export const TestRun = mongoose.model(
  'TestRun',
  new Schema(
    {
      projectId: {
        type: Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true,
      },
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
