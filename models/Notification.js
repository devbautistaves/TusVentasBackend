const mongoose = require("mongoose")

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
    },
    type: {
      type: String,
      enum: ["info", "meeting", "document", "announcement", "training"],
      default: "info",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    recipients: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        read: {
          type: Boolean,
          default: false,
        },
        readAt: Date,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    attachments: [
      {
        filename: String,
        originalName: String,
        path: String,
        size: Number,
        mimetype: String,
      },
    ],
    meetingInfo: {
      date: Date,
      link: String,
      platform: {
        type: String,
        enum: ["zoom", "google-meet", "teams", "other"],
      },
      duration: Number, // in minutes
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("Notification", notificationSchema)
