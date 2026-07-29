const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a task title'],
    },
    description: {
      type: String,
    },
    status: {
      type: String,
      enum: ['To Do', 'In Progress', 'In Review', 'Done'],
      default: 'To Do',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    assigneeInitials: {
      type: String,
    },
    dueDate: {
      type: Date,
    },
    dueTime: {
      type: String,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
    },
    comments: [
      {
        id: {
          type: String,
        },
        author: {
          type: String,
        },
        authorInitials: {
          type: String,
        },
        text: {
          type: String,
        },
        timestamp: {
          type: String,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

TaskSchema.index({ assignee: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ priority: 1 });
TaskSchema.index({ project: 1 });

module.exports = mongoose.model('Task', TaskSchema);