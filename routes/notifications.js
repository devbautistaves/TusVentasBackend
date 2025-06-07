const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const Notification = require("../models/Notification")
const User = require("../models/User")
const { authenticateToken, requireAdmin } = require("../middleware/auth")

const router = express.Router()

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads/notifications")
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true })
    }
    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt|jpg|jpeg|png|gif/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error("Only documents and images are allowed"))
    }
  },
})

// Create notification (Admin only)
router.post("/", authenticateToken, requireAdmin, upload.array("files", 5), async (req, res) => {
  try {
    console.log("Creating notification")
    const {
      title,
      message,
      type,
      priority,
      recipientType,
      meetingDate,
      meetingLink,
      meetingPlatform,
      meetingDuration,
    } = req.body

    // Get recipients based on type
    let recipients = []
    if (recipientType === "all") {
      const users = await User.find({ role: "seller", isActive: true })
      recipients = users.map((user) => ({ userId: user._id }))
    } else if (recipientType === "specific" && req.body.recipients) {
      const userIds = JSON.parse(req.body.recipients)
      recipients = userIds.map((userId) => ({ userId }))
    }

    // Process uploaded files
    const attachments = req.files
      ? req.files.map((file) => ({
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype,
        }))
      : []

    // Meeting info
    const meetingInfo =
      type === "meeting"
        ? {
            date: new Date(meetingDate),
            link: meetingLink,
            platform: meetingPlatform,
            duration: Number.parseInt(meetingDuration) || 60,
          }
        : undefined

    const notification = new Notification({
      title,
      message,
      type,
      priority,
      recipients,
      createdBy: req.user.userId,
      attachments,
      meetingInfo,
    })

    await notification.save()
    console.log("Notification created:", notification._id)

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
      notification,
    })
  } catch (error) {
    console.error("Error creating notification:", error)
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create notification",
    })
  }
})

// Get notifications for current user
router.get("/", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching notifications for user:", req.user.userId)
    const { page = 1, limit = 10, unreadOnly = false } = req.query

    const matchStage = {
      "recipients.userId": req.user.userId,
      isActive: true,
    }

    if (unreadOnly === "true") {
      matchStage["recipients.read"] = false
    }

    const notifications = await Notification.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: Number.parseInt(limit) },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $addFields: {
          userRecipient: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$recipients",
                  cond: { $eq: ["$$this.userId", req.user.userId] },
                },
              },
              0,
            ],
          },
        },
      },
    ])

    const total = await Notification.countDocuments(matchStage)
    console.log(`Found ${notifications.length} notifications out of ${total} total`)

    res.json({
      success: true,
      notifications,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number.parseInt(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching notifications:", error)
    res.status(500).json({
      success: false,
      error: "Failed to fetch notifications",
    })
  }
})

// Mark notification as read
router.put("/:id/read", authenticateToken, async (req, res) => {
  try {
    console.log("Marking notification as read:", req.params.id)
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        "recipients.userId": req.user.userId,
      },
      {
        $set: {
          "recipients.$.read": true,
          "recipients.$.readAt": new Date(),
        },
      },
      { new: true },
    )

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      })
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    })
  } catch (error) {
    console.error("Error marking notification as read:", error)
    res.status(500).json({
      success: false,
      error: "Failed to mark notification as read",
    })
  }
})

// Get unread count
router.get("/unread-count", authenticateToken, async (req, res) => {
  try {
    console.log("Getting unread notification count for user:", req.user.userId)
    const count = await Notification.countDocuments({
      "recipients.userId": req.user.userId,
      "recipients.read": false,
      isActive: true,
    })

    console.log("Unread notification count:", count)
    res.json({
      success: true,
      count,
    })
  } catch (error) {
    console.error("Error getting unread count:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get unread count",
    })
  }
})

// Download attachment
router.get("/attachment/:notificationId/:filename", authenticateToken, async (req, res) => {
  try {
    console.log("Downloading attachment:", req.params.filename)
    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      "recipients.userId": req.user.userId,
    })

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      })
    }

    const attachment = notification.attachments.find((att) => att.filename === req.params.filename)
    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: "Attachment not found",
      })
    }

    const filePath = attachment.path
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "File not found on server",
      })
    }

    res.download(filePath, attachment.originalName)
  } catch (error) {
    console.error("Error downloading attachment:", error)
    res.status(500).json({
      success: false,
      error: "Failed to download attachment",
    })
  }
})

module.exports = router
