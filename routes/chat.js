const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const ChatRoom = require("../models/ChatRoom")
const Message = require("../models/Message")
const User = require("../models/User")
const { authenticateToken, requireAdmin } = require("../middleware/auth")

const router = express.Router()

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads/chat")
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
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error("Only images and documents are allowed"))
    }
  },
})

// Get or create group chat
router.get("/group", authenticateToken, async (req, res) => {
  try {
    console.log("Getting group chat")
    let groupChat = await ChatRoom.findOne({ type: "group" })
      .populate("participants", "name email role")
      .populate("lastMessage")

    if (!groupChat) {
      // Create group chat if it doesn't exist
      console.log("Creating new group chat")
      const allUsers = await User.find({ isActive: true })
      groupChat = new ChatRoom({
        name: "Chat Grupal - Equipo de Ventas",
        type: "group",
        participants: allUsers.map((user) => user._id),
        createdBy: req.user.userId,
      })
      await groupChat.save()
      await groupChat.populate("participants", "name email role")
    }

    res.json({
      success: true,
      chatRoom: groupChat,
    })
  } catch (error) {
    console.error("Error getting group chat:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get group chat",
    })
  }
})

// Get or create private chat with admin
router.get("/private-admin", authenticateToken, async (req, res) => {
  try {
    console.log("Getting private chat with admin for user:", req.user.userId)
    const admin = await User.findOne({ role: "admin" })
    if (!admin) {
      return res.status(404).json({
        success: false,
        error: "Admin not found",
      })
    }

    let privateChat = await ChatRoom.findOne({
      type: "private",
      participants: { $all: [req.user.userId, admin._id] },
    })
      .populate("participants", "name email role")
      .populate("lastMessage")

    if (!privateChat) {
      console.log("Creating new private chat with admin")
      const user = await User.findById(req.user.userId)
      privateChat = new ChatRoom({
        name: `Chat Privado - ${user.name} & Admin`,
        type: "private",
        participants: [req.user.userId, admin._id],
        createdBy: req.user.userId,
      })
      await privateChat.save()
      await privateChat.populate("participants", "name email role")
    }

    res.json({
      success: true,
      chatRoom: privateChat,
    })
  } catch (error) {
    console.error("Error getting private chat:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get private chat",
    })
  }
})

// Get all private chats (Admin only)
router.get("/private-chats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log("Getting all private chats for admin")
    const privateChats = await ChatRoom.find({
      type: "private",
      participants: req.user.userId,
    })
      .populate("participants", "name email role")
      .populate("lastMessage")
      .sort({ lastActivity: -1 })

    console.log(`Found ${privateChats.length} private chats`)
    res.json({
      success: true,
      chatRooms: privateChats,
    })
  } catch (error) {
    console.error("Error getting private chats:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get private chats",
    })
  }
})

// Send message
router.post("/:chatRoomId/messages", authenticateToken, upload.single("attachment"), async (req, res) => {
  try {
    console.log("Sending message to chat room:", req.params.chatRoomId)
    const { content } = req.body
    const chatRoomId = req.params.chatRoomId

    // Verify user is participant
    const chatRoom = await ChatRoom.findOne({
      _id: chatRoomId,
      participants: req.user.userId,
    })

    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        error: "Chat room not found or access denied",
      })
    }

    // Process attachment if any
    let attachment = null
    let messageType = "text"

    if (req.file) {
      attachment = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype,
      }

      // Determine message type based on mimetype
      if (req.file.mimetype.startsWith("image/")) {
        messageType = "image"
      } else {
        messageType = "file"
      }
    }

    const message = new Message({
      chatRoom: chatRoomId,
      sender: req.user.userId,
      content,
      type: messageType,
      attachments: attachment ? [attachment] : [],
    })

    await message.save()
    await message.populate("sender", "name email role")

    // Update chat room last activity and message
    await ChatRoom.findByIdAndUpdate(chatRoomId, {
      lastMessage: message._id,
      lastActivity: new Date(),
    })

    console.log("Message sent successfully:", message._id)
    res.status(201).json({
      success: true,
      message,
    })
  } catch (error) {
    console.error("Error sending message:", error)
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting file:", err)
      })
    }
    res.status(500).json({
      success: false,
      error: "Failed to send message",
    })
  }
})

// Get messages for a chat room
router.get("/:chatRoomId/messages", authenticateToken, async (req, res) => {
  try {
    console.log("Getting messages for chat room:", req.params.chatRoomId)
    const { page = 1, limit = 50 } = req.query
    const chatRoomId = req.params.chatRoomId

    // Verify user is participant
    const chatRoom = await ChatRoom.findOne({
      _id: chatRoomId,
      participants: req.user.userId,
    })

    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        error: "Chat room not found or access denied",
      })
    }

    const messages = await Message.find({ chatRoom: chatRoomId })
      .populate("sender", "name email role")
      .sort({ createdAt: -1 })
      .limit(Number.parseInt(limit))
      .skip((Number.parseInt(page) - 1) * Number.parseInt(limit))

    const total = await Message.countDocuments({ chatRoom: chatRoomId })
    console.log(`Found ${messages.length} messages out of ${total} total`)

    res.json({
      success: true,
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number.parseInt(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error getting messages:", error)
    res.status(500).json({
      success: false,
      error: "Failed to get messages",
    })
  }
})

// Mark messages as read
router.put("/:chatRoomId/read", authenticateToken, async (req, res) => {
  try {
    console.log("Marking messages as read in chat room:", req.params.chatRoomId)
    const chatRoomId = req.params.chatRoomId

    await Message.updateMany(
      {
        chatRoom: chatRoomId,
        sender: { $ne: req.user.userId },
        "readBy.user": { $ne: req.user.userId },
      },
      {
        $push: {
          readBy: {
            user: req.user.userId,
            readAt: new Date(),
          },
        },
      },
    )

    res.json({
      success: true,
      message: "Messages marked as read",
    })
  } catch (error) {
    console.error("Error marking messages as read:", error)
    res.status(500).json({
      success: false,
      error: "Failed to mark messages as read",
    })
  }
})

module.exports = router
