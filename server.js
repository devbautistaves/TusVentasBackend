const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
require("dotenv").config()
const axios = require('axios')
const nodemailer = require('nodemailer');


const multer = require("multer")
const path = require("path")
const fs = require("fs")
const bucket = require('./firebaseAdmin');



const app = express()
const PORT = process.env.PORT || 5000


const TELEGRAM_TOKEN = '7649651512:AAFe_N3slNd9Q1gjy-HJ01ldZ8I8qoYUqEQ';
const CHAT_ID = '-1002813962725'; // tu chat_id

async function enviarMensajeTelegram(texto) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  await axios.post(url, {
    chat_id: CHAT_ID,
    text: texto,
    parse_mode: 'HTML'
  });
}
// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Security middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (token == null) return res.sendStatus(401)

  jwt.verify(token, process.env.JWT_SECRET || "your-secret-key", (err, user) => {
    if (err) return res.sendStatus(403)
    req.user = user
    next()
  })
}

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Admin role required.",
    })
  }
  next()
}

app.put("/api/admin/sales/:id", (req, res) => {
  console.log("Llegó al backend:", req.params.id, req.body)
  res.json({ ok: true })
})
// Lista de statuses válidos según tu enum
const validStatuses = ["pending", "completed", "cancelled", "installed", "pending_appointment", "appointed"]

app.put("/sales/:id", async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  // Validar ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido" })
  }

  // Validar status
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      message: `Status inválido. Debe ser uno de: ${validStatuses.join(", ")}`,
    })
  }

  try {
    // Update agresivo sólo para el status y fecha
    const updatedSale = await Sale.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true, runValidators: true },
    )

    if (!updatedSale) {
      return res.status(404).json({ message: "Venta no encontrada" })
    }

    return res.status(200).json(updatedSale)
  } catch (error) {
    console.error("Error actualizando estado:", error)
    return res.status(500).json({ message: "Error interno del servidor" })
  }
})

// CORS configuration
app.use(cors()) // 👈 ¡Solo para pruebas! No uses esto en producción

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

// MongoDB Connection with better error handling - MODIFICADO PARA MONGODB CLOUD
const connectDB = async () => {
  try {
    // Clear any existing connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }

    // Configuración específica para MongoDB Atlas Cloud
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // Mantener hasta 10 conexiones socket
      serverSelectionTimeoutMS: 10000, // Tiempo de espera para seleccionar servidor
      socketTimeoutMS: 45000, // Cerrar sockets después de 45 segundos de inactividad
      family: 4, // Usar IPv4, saltar IPv6
      retryWrites: true,
      w: "majority",
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, options)

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`)
    console.log(`📊 Database: ${conn.connection.name}`)

    // Test the connection
    const collections = await mongoose.connection.db.listCollections().toArray()
    console.log(`📋 Collections found: ${collections.map((c) => c.name).join(", ")}`)

    // Eventos de conexión para MongoDB Atlas
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB Atlas connection error:", err)
    })

    mongoose.connection.on("disconnected", () => {
      console.log("🔌 MongoDB Atlas disconnected")
    })

    mongoose.connection.on("reconnected", () => {
      console.log("🔄 MongoDB Atlas reconnected")
    })
  } catch (error) {
    console.error("❌ MongoDB Atlas connection error:", error)

    // Mensajes específicos para errores comunes de MongoDB Atlas
    if (error.name === "MongoServerSelectionError") {
      console.error("💡 Posibles soluciones para MongoDB Atlas:")
      console.error("   - Verifica que tu IP esté en la lista blanca de MongoDB Atlas")
      console.error("   - Confirma que el usuario y contraseña sean correctos")
      console.error("   - Asegúrate de que el cluster esté activo")
      console.error("   - Verifica tu conexión a internet")
    }

    if (error.message.includes("authentication failed")) {
      console.error("💡 Error de autenticación:")
      console.error("   - Verifica el usuario y contraseña en MongoDB Atlas")
      console.error("   - Asegúrate de que el usuario tenga permisos de lectura/escritura")
    }

    process.exit(1)
  }
}

// Connect to database
connectDB()

// User Schema
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: ["seller", "admin"],
        message: "Role must be either seller or admin",
      },
      default: "seller",
    },
    commissionRate: {
      type: Number,
      default: 0.3,
      min: [0, "Commission rate cannot be negative"],
      max: [1, "Commission rate cannot exceed 100%"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalSales: {
      type: Number,
      default: 0,
      min: [0, "Total sales cannot be negative"],
    },
    totalCommissions: {
      type: Number,
      default: 0,
      min: [0, "Total commissions cannot be negative"],
    },
  },
  {
    timestamps: true,
  },
)

// Sale Schema
const saleSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Seller ID is required"],
    },
    sellerName: {
      type: String,
      required: [true, "Seller name is required"],
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: [true, "Plan ID is required"],
    },
    planName: {
      type: String,
      required: [true, "Plan name is required"],
    },
    planPrice: {
      type: Number,
      required: [true, "Plan price is required"],
      min: [0.01, "Plan price must be greater than 0"],
    },
    commission: {
      type: Number,
      required: [true, "Commission is required"],
      min: [0, "Commission cannot be negative"],
    },
    commissionRate: {
      type: Number,
      required: [true, "Commission rate is required"],
      min: [0, "Commission rate cannot be negative"],
      max: [1, "Commission rate cannot exceed 100%"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "completed", "cancelled", "installed", "pending_appointment", "appointed"],
        message: "Status must be one of the allowed values",
      },
      default: "pending",
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: {
            values: ["pending", "completed", "cancelled", "installed", "pending_appointment", "appointed"],
          },
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        notes: {
          type: String,
          trim: true,
        },
      },
    ],
    customerInfo: {
      name: {
        type: String,
        required: [true, "Customer name is required"],
        trim: true,
        maxlength: [100, "Customer name cannot exceed 100 characters"],
      },
      email: {
        type: String,
        required: [true, "Customer email is required"],
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid customer email"],
      },
      phone: {
        type: String,
        required: [true, "Customer phone is required"],
        trim: true,
      },
      dni: {
        type: String,
        required: [true, "Customer DNI is required"],
        trim: true,
      },

      address: {
        street: {
          type: String,
          required: [true, "Street is required"],
          trim: true,
        },
        number: {
          type: String,
          required: [true, "Street number is required"],
          trim: true,
        },
        city: {
          type: String,
          required: [true, "City is required"],
          trim: true,
        },
        province: {
          type: String,
          required: [true, "Province is required"],
          trim: true,
        },
        postalCode: {
          type: String,
          required: [true, "Postal code is required"],
          trim: true,
        },
      },
    },
  },
  {
    timestamps: true,
  },
)

// Plan Schema
const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
      maxlength: [100, "Plan name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Plan description is required"],
      trim: true,
      maxlength: [500, "Plan description cannot exceed 500 characters"],
    },
    price: {
      type: Number,
      required: [true, "Plan price is required"],
      min: [0.01, "Plan price must be greater than 0"],
    },
    features: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
)



// Notification Schema
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
      enum: {
        values: ["info", "meeting", "document", "announcement", "training"],
        message: "Type must be one of the allowed values",
      },
      default: "info",
    },
    priority: {
      type: String,
      enum: {
        values: ["low", "medium", "high", "urgent"],
        message: "Priority must be one of the allowed values",
      },
      default: "medium",
    },
    recipients: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
attachments: [
  {
    originalName: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
  },
],

    meetingInfo: {
      date: Date,
      time: String,
      duration: Number,
      platform: {
        type: String,
        enum: ["zoom", "google-meet", "teams", "other"],
      },
      link: String,
      description: String,
    },
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

// ChatRoom Schema
const chatRoomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Chat room name is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: {
        values: ["group", "private"],
        message: "Type must be group or private",
      },
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    lastActivity: {
      type: Date,
      default: Date.now,
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

// Message Schema
const messageSchema = new mongoose.Schema(
  {
    chatRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      maxlength: [1000, "Message cannot exceed 1000 characters"],
    },
    type: {
      type: String,
      enum: {
        values: ["text", "file", "image"],
        message: "Type must be text, file, or image",
      },
      default: "text",
    },
attachments: [
  {
    originalName: String,
    url: String,
    size: Number,
    type: String,
  },
],
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: Date,
  },
  {
    timestamps: true,
  },
)

// Models
const User = mongoose.model("User", userSchema)
const Sale = mongoose.model("Sale", saleSchema)
const Plan = mongoose.model("Plan", planSchema)
const Notification = mongoose.model("Notification", notificationSchema)
const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema)
const Message = mongoose.model("Message", messageSchema)

// Configure multer for file uploads
const storage = multer.memoryStorage()
const upload = multer({ storage })

// Error handling helper
const handleError = (res, error, message = "Server error") => {
  console.error(`${message}:`, error)

  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => err.message)
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: errors,
    })
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0]
    return res.status(400).json({
      success: false,
      error: `${field} already exists`,
      code: "DUPLICATE_FIELD",
    })
  }

  res.status(500).json({
    success: false,
    error: message,
  })
}

// Routes

// Health check with database status
app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    const dbStatus = mongoose.connection.readyState
    const dbStates = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    }

    // Count documents to test database
    const userCount = await User.countDocuments()
    const saleCount = await Sale.countDocuments()
    const planCount = await Plan.countDocuments()
    const notificationCount = await Notification.countDocuments()
    const chatRoomCount = await ChatRoom.countDocuments()
    const messageCount = await Message.countDocuments()

    res.json({
      success: true,
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      database: {
        status: dbStates[dbStatus],
        name: mongoose.connection.name,
        collections: {
          users: userCount,
          sales: saleCount,
          plans: planCount,
          notifications: notificationCount,
          chatRooms: chatRoomCount,
          messages: messageCount,
        },
      },
    })
  } catch (error) {
    console.error("Health check error:", error)
    res.status(500).json({
      success: false,
      status: "ERROR",
      error: error.message,
      database: {
        status: "error",
      },
    })
  }
})

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone, location } = req.body

    if (!name || !email || !password || !phone || !location) {
      return res.status(400).json({
        success: false,
        error: "All fields are required",
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long",
      })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User already exists with this email",
      })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      location,
      commissionRate: 0.3,
    })

    await user.save()

    await enviarMensajeTelegram(`📥 <b>Nuevo registro</b>\n👤 Nombre: ${name}\n📧 Email: ${email}\n📞 Teléfono: ${phone}`);

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" },
    )

    res.status(201).json({
      success: true,
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        role: user.role,
        commissionRate: user.commissionRate,
      },
    })
  } catch (error) {
    handleError(res, error, "Registration failed")
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid credentials",
      })
    }

    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        error: "Account is deactivated",
      })
    }

    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: "Invalid credentials",
      })
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" },
    )

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        role: user.role,
        commissionRate: user.commissionRate,
        totalSales: user.totalSales,
        totalCommissions: user.totalCommissions,
      },
    })
  } catch (error) {
    handleError(res, error, "Login failed")
  }
})

// User Routes
app.get("/api/users/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password")
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    res.json({
      success: true,
      user,
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch profile")
  }
})

app.put("/api/users/profile", authenticateToken, async (req, res) => {
  try {
    const { name, phone, location } = req.body

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { name, phone, location },
      { new: true, runValidators: true },
    ).select("-password")

    res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    })
  } catch (error) {
    handleError(res, error, "Failed to update profile")
  }
})

// Sales Routes
app.post("/api/sales", authenticateToken, async (req, res) => {
  try {
    console.log("Creating sale - User:", req.user.userId)

    const { planId, description } = req.body
    console.log('REQ BODY:', req.body)

    let customerInfo = req.body.customerInfo


    console.log('PLAN:', req.body.plan);
console.log('DESCRIPTION:', req.body.description);
console.log('CUSTOMER:', req.body.customer);
    if (!planId || !description || !customerInfo) {
      return res.status(400).json({
        success: false,
        error: "Plan, description and customer info are required",
      })
    }

    if (typeof customerInfo === "string") {
      customerInfo = JSON.parse(customerInfo)
    }

    const requiredCustomerFields = ["name", "email", "phone", "dni"]
    const requiredAddressFields = ["street", "number", "city", "province", "postalCode"]

    for (const field of requiredCustomerFields) {
      if (!customerInfo[field]) {
        return res.status(400).json({
          success: false,
          error: `Customer ${field} is required`,
        })
      }
    }

    if (!customerInfo.address) {
      return res.status(400).json({
        success: false,
        error: "Customer address is required",
      })
    }

    for (const field of requiredAddressFields) {
      if (!customerInfo.address[field]) {
        return res.status(400).json({
          success: false,
          error: `Customer address ${field} is required`,
        })
      }
    }

    const plan = await Plan.findById(planId)
    if (!plan || !plan.isActive) {
      return res.status(404).json({
        success: false,
        error: "Plan not found or inactive",
      })
    }

    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    const commission = plan.price * user.commissionRate

    const statusHistory = [
      {
        status: "pending",
        changedBy: user._id,
        changedAt: new Date(),
        notes: "Venta registrada",
      },
    ]

    const sale = new Sale({
      sellerId: user._id,
      sellerName: user.name,
      planId: plan._id,
      planName: plan.name,
      planPrice: plan.price,
      commission,
      commissionRate: user.commissionRate,
      description,
      customerInfo,
      statusHistory,
    })

    await sale.save()
        // Solo sumar al total si la venta no está cancelada

    console.log("Sale created successfully:", sale._id)
await enviarMensajeTelegram(
  `🛒 Nueva venta:\n💰 Monto: $${plan.price}\n📦 Producto: ${plan.name}\n👤 Vendedor: ${user.name}`
)
    if (sale.status !== "cancelled") {
    await User.findByIdAndUpdate(user._id, {
      $inc: {
        totalSales: plan.price,
        totalCommissions: commission,
      },
    })
    }

    res.status(201).json({
      success: true,
      message: "Sale created successfully",
      sale,
    })

  } catch (error) {
    console.error("Error creating sale:", error)
    if (req.file) {
      fs.unlink(path.join(uploadsDir, req.file.filename), (err) => {
        if (err) console.error("Error deleting file:", err)
      })
    }
    handleError(res, error, "Failed to create sale")
  }
})

app.get("/api/sales", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching sales for user:", req.user.userId)

    const { page = 1, limit = 10, status, startDate, endDate } = req.query

    const query = { sellerId: req.user.userId }

    if (status) query.status = status
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    console.log("Sales query:", query)

    const sales = await Sale.find(query)
      .populate("planId", "name description")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Sale.countDocuments(query)

    console.log(`Found ${sales.length} sales out of ${total} total`)

    res.json({
      success: true,
      sales,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching sales:", error)
    handleError(res, error, "Failed to fetch sales")
  }
})

// Plans Routes
app.get("/api/plans", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching plans")

    const plans = await Plan.find({ isActive: true }).select("name description price features").sort({ price: 1 })

    console.log(`Found ${plans.length} active plans`)

    res.json({
      success: true,
      plans,
    })
  } catch (error) {
    console.error("Error fetching plans:", error)
    handleError(res, error, "Failed to fetch plans")
  }
})

// Dashboard Routes
app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching dashboard stats for user:", req.user.userId)

    const userId = req.user.userId

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    const salesStats = await Sale.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$planPrice" },
          totalCommissions: { $sum: "$commission" },
          totalCount: { $sum: 1 },
          avgSale: { $avg: "$planPrice" },
        },
      },
    ])

    const monthlyStats = await Sale.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalSales: { $sum: "$planPrice" },
          totalCommissions: { $sum: "$commission" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ])

    const stats = salesStats[0] || {
      totalSales: 0,
      totalCommissions: 0,
      totalCount: 0,
      avgSale: 0,
    }

    console.log("Dashboard stats:", stats)

    res.json({
      success: true,
      user: {
        name: user.name,
        commissionRate: user.commissionRate,
      },
      stats,
      monthlyStats,
    })
  } catch (error) {
    console.error("Error fetching dashboard stats:", error)
    handleError(res, error, "Failed to fetch dashboard stats")
  }
})

// Admin Routes
app.get("/api/admin/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log("Fetching admin stats")

    const totalStats = await Sale.aggregate([
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$planPrice" },
          totalCommissions: { $sum: "$commission" },
          totalCount: { $sum: 1 },
        },
      },
    ])

    const userCount = await User.countDocuments({ role: "seller" })
    const planCount = await Plan.countDocuments({ isActive: true })

    const topSellers = await Sale.aggregate([
      {
        $group: {
          _id: "$sellerId",
          sellerName: { $first: "$sellerName" },
          totalSales: { $sum: "$planPrice" },
          totalCommissions: { $sum: "$commission" },
          salesCount: { $sum: 1 },
        },
      },
      { $sort: { totalSales: -1 } },
      { $limit: 10 },
    ])

    const topPlans = await Sale.aggregate([
      {
        $group: {
          _id: "$planId",
          planName: { $first: "$planName" },
          totalSales: { $sum: "$planPrice" },
          salesCount: { $sum: 1 },
        },
      },
      { $sort: { salesCount: -1 } },
      { $limit: 10 },
    ])

    const stats = totalStats[0] || {
      totalSales: 0,
      totalCommissions: 0,
      totalCount: 0,
    }

    console.log("Admin stats:", { stats, userCount, planCount })

    res.json({
      success: true,
      stats,
      userCount,
      planCount,
      topSellers,
      topPlans,
    })
  } catch (error) {
    console.error("Error fetching admin stats:", error)
    handleError(res, error, "Failed to fetch admin stats")
  }
})

app.get("/api/admin/sales", authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log("Fetching admin sales")

    const { page = 1, limit = 20, status, sellerId, startDate, endDate } = req.query

    const query = {}

    if (status) query.status = status
    if (sellerId) query.sellerId = sellerId
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    console.log("Admin sales query:", query)

    const sales = await Sale.find(query)
      .populate("sellerId", "name email commissionRate")
      .populate("planId", "name description")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Sale.countDocuments(query)

    console.log(`Found ${sales.length} admin sales out of ${total} total`)

    res.json({
      success: true,
      sales,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching admin sales:", error)
    handleError(res, error, "Failed to fetch admin sales")
  }
})

app.put("/api/admin/sales/:id/status", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      });
    }

    const validStatuses = ["pending", "completed", "cancelled", "installed", "pending_appointment", "appointed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status value",
        validValues: validStatuses,
      });
    }

    const sale = await Sale.findById(id);
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: "Sale not found",
      });
    }

    const previousStatus = sale.status; // Guardamos el estado anterior

    sale.statusHistory.push({
      status,
      changedBy: req.user.userId,
      changedAt: new Date(),
      notes: notes || "",
    });

    sale.status = status;

    // Si el estado cambia A "cancelled"
    if (status === "cancelled" && previousStatus !== "cancelled") {
      await User.findByIdAndUpdate(sale.sellerId, {
        $inc: {
          totalSales: -sale.planPrice,
          totalCommissions: -sale.commission,
        },
      });
      console.log(
        `Venta cancelada: Descontado $${sale.planPrice} en ventas y $${sale.commission} en comisiones para el usuario ${sale.sellerId}`,
      );
    }

    // Si el estado cambia DE "cancelled" a otro
    if (previousStatus === "cancelled" && status !== "cancelled") {
      await User.findByIdAndUpdate(sale.sellerId, {
        $inc: {
          totalSales: sale.planPrice,
          totalCommissions: sale.commission,
        },
      });
      console.log(
        `Venta reactivada: Sumado $${sale.planPrice} en ventas y $${sale.commission} en comisiones para el usuario ${sale.sellerId}`,
      );
    }

    await sale.save();

    res.json({
      success: true,
      message: "Sale status updated successfully",
      sale,
    });
  } catch (error) {
    handleError(res, error, "Failed to update sale status");
  }
});
app.get("/api/admin/plans", authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log("Fetching admin plans")

    const { page = 1, limit = 20 } = req.query

    const plans = await Plan.find({})
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Plan.countDocuments({})

    console.log(`Found ${plans.length} admin plans out of ${total} total`)

    res.json({
      success: true,
      plans,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching admin plans:", error)
    handleError(res, error, "Failed to fetch admin plans")
  }
})

app.post("/api/admin/plans", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, features } = req.body

    if (!name || !description || !price) {
      return res.status(400).json({
        success: false,
        error: "Name, description and price are required",
      })
    }

    const plan = new Plan({
      name,
      description,
      price: Number(price),
      features: features || [],
      createdBy: req.user.userId,
    })

    await plan.save()

    res.status(201).json({
      success: true,
      message: "Plan created successfully",
      plan,
    })
  } catch (error) {
    handleError(res, error, "Failed to create plan")
  }
})

app.put("/api/admin/plans/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, features, isActive } = req.body

    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      { name, description, price: Number(price), features, isActive },
      { new: true, runValidators: true },
    )

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: "Plan not found",
      })
    }

    res.json({
      success: true,
      message: "Plan updated successfully",
      plan,
    })
  } catch (error) {
    handleError(res, error, "Failed to update plan")
  }
})

app.delete("/api/admin/plans/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id)

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: "Plan not found",
      })
    }

    res.json({
      success: true,
      message: "Plan deleted successfully",
    })
  } catch (error) {
    handleError(res, error, "Failed to delete plan")
  }
})

app.get("/api/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log("Fetching admin users")

    const { page = 1, limit = 20, isActive } = req.query

    const usersQuery = {}
    if (isActive !== undefined) {
      usersQuery.isActive = isActive === "true"
    }

    const users = await User.find(usersQuery)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const totalUsers = await User.countDocuments(usersQuery)

    console.log(`Found ${users.length} users out of ${totalUsers} total`)

    res.json({
      success: true,
      users,
      pagination: {
        totalPages: Math.ceil(totalUsers / limit),
        currentPage: Number(page),
        total: totalUsers,
        hasNext: page * limit < totalUsers,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch admin users")
  }
})

app.put("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, phone, location, commissionRate, isActive } = req.body

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, phone, location, commissionRate: Number(commissionRate), isActive },
      { new: true, runValidators: true },
    ).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    res.json({
      success: true,
      message: "User updated successfully",
      user,
    })
  } catch (error) {
    handleError(res, error, "Failed to update user")
  }
})

app.delete("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    })
  } catch (error) {
    handleError(res, error, "Failed to delete user")
  }
})

// Notification Routes
app.get("/api/notifications", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, priority, unreadOnly } = req.query
    const userId = req.user.userId

    const query = {
      $or: [
        { recipients: userId },
        { recipients: { $size: 0 } }, // Global notifications
      ],
      isActive: true,
    }

    if (type) query.type = type
    if (priority) query.priority = priority
    if (unreadOnly === "true") {
      query["readBy.userId"] = { $ne: userId }
    }

    const notifications = await Notification.find(query)
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Notification.countDocuments(query)
    const unreadCount = await Notification.countDocuments({
      ...query,
      "readBy.userId": { $ne: userId },
    })

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch notifications")
  }
})

app.post("/api/notifications", authenticateToken, requireAdmin, upload.array("attachments", 5), async (req, res) => {
  try {
const { title, message, type, priority, recipients, meetingInfo } = req.body;
const { recipientType } = req.body;
    // Parsear attachments si vienen en string (por si acaso)
    if (typeof req.body.attachments === 'string') {
      try {
        req.body.attachments = JSON.parse(req.body.attachments);
      } catch (error) {
        return res.status(400).json({ success: false, error: 'attachments inválidos' });
      }
    }

    if (!title || !message) {
      return res.status(400).json({ success: false, error: "Title and message are required" });
    }


let parsedRecipients = recipients ? (typeof recipients === "string" ? JSON.parse(recipients) : recipients) : [];



if (recipientType === "all") {
  const allVendedores = await User.find({     isActive: true,
    role: { $in: ["seller", "admin"] },
  }).select("_id");
  parsedRecipients = allVendedores.map(u => u._id.toString());
}

let parsedMeetingInfo = meetingInfo ? (typeof meetingInfo === "string" ? JSON.parse(meetingInfo) : meetingInfo) : null;

    // Aquí viene la modificación importante: subir los archivos a Firebase
    const attachments = await Promise.all(
      (req.files || []).map(async (file) => {
        const fileName = `attachments/${Date.now()}_${file.originalname}`;
        const fileUpload = bucket.file(fileName);

        // Subir archivo buffer a Firebase Storage
        await fileUpload.save(file.buffer, {
          metadata: {
            contentType: file.mimetype,
          },
        });

        // Obtener URL firmada (válida por 1 hora)
    // Hacer el archivo público (acceso libre)
    await fileUpload.makePublic();

    // Construir URL pública fija
    const publicUrl = `https://storage.googleapis.com/probandocositas-8c425.appspot.com/${fileName}`;

    return {
      originalName: file.originalname,
      url: publicUrl,  // URL fija y pública
      size: file.size,
      type: file.mimetype,
    };
  })
);

    const notification = new Notification({
      title,
      message,
      type: type || "info",
      priority: priority || "medium",
      recipients: parsedRecipients,
      createdBy: req.user.userId,
      attachments,
      meetingInfo: parsedMeetingInfo,
    });

    await notification.save();

    const transporter = nodemailer.createTransport({
  service: 'gmail', // o tu proveedor SMTP
  auth: {
    user: 'tusventasok@gmail.com',
    pass: 'fxjm jrgg copy lidm' // Gmail requiere contraseña de aplicación
  }
});


        // Buscar emails de usuarios destinatarios
    const usuarios = await User.find({ _id: { $in: parsedRecipients } }).select("email name");

console.log("Usuarios destinatarios:", usuarios.map(u => u.email));


for (const user of usuarios) {
  try {
    console.log(`Enviando correo a: ${user.email}`);
    await transporter.sendMail({
      from: '"TusVentas" <tucorreo@gmail.com>',
      to: user.email,
      subject: `🔔 Nueva notificación de el equipo de TusVentas: ${title}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5;">
          <img src="cid:logoTusVentas" style="max-width: 700px; margin-bottom: 20px;" alt="TusVentas" />
          <h2>Hola ${user.name} tenes una notificacion pendiente de:📌 ${title}</h2>
          <p><strong>Tipo:</strong> ${type}</p>
          <p>${message}</p>
          <p><a href="https://tusventas.netlify.app" style="display:inline-block; padding:10px 15px; background-color:#0b6efd; color:white; text-decoration:none; border-radius:5px;">Ver en la plataforma</a></p>
          <hr />
          <small>Este mensaje fue enviado automáticamente por el sistema TusVentas.</small>
        </div>
      `,
      attachments: [
        {
          filename: 'bannertusventas.png',
          path: './bannertusventas.png', // o desde Firebase si lo descargás
          cid: 'logoTusVentas' // este ID es el que usás en src="cid:logoTusVentas"
        }
      ]
    });
  } catch (err) {
    console.error(`Error enviando correo a ${user.email}:`, err.message);
  }
}

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
      notification,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message || "Failed to create notification" });
  }
});

app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id)
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      })
    }

    const alreadyRead = notification.readBy.some((read) => read.userId.toString() === req.user.userId.toString())

    if (!alreadyRead) {
      notification.readBy.push({
        userId: req.user.userId,
        readAt: new Date(),
      })
      await notification.save()
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    })
  } catch (error) {
    handleError(res, error, "Failed to mark notification as read")
  }
})

app.get("/api/notifications/unread-count", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    const query = {
      $or: [
        { recipients: userId },
        { recipients: { $size: 0 } }, // Global notifications
      ],
      isActive: true,
      "readBy.userId": { $ne: userId }, // Solo no leídas
    }

    const count = await Notification.countDocuments(query)

    res.json({
      success: true,
      count,
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch unread notifications count")
  }
})

// Chat Routes
app.get("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    const rooms = await ChatRoom.find({
      participants: userId,
      isActive: true,
    })
      .populate("participants", "name role")
      .populate("lastMessage")
      .populate("createdBy", "name role")
      .sort({ lastActivity: -1 })

    res.json({
      success: true,
      rooms,
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch chat rooms")
  }
})

app.post("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const { name, type, participants } = req.body
    const userId = req.user.userId

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: "Name and type are required",
      })
    }

    let roomParticipants = [userId]
    if (participants && Array.isArray(participants)) {
      roomParticipants = [...new Set([...roomParticipants, ...participants])]
    }

    const chatRoom = new ChatRoom({
      name,
      type,
      participants: roomParticipants,
      createdBy: userId,
    })

    await chatRoom.save()

    const populatedRoom = await ChatRoom.findById(chatRoom._id)
      .populate("participants", "name role")
      .populate("createdBy", "name role")

    res.status(201).json({
      success: true,
      message: "Chat room created successfully",
      room: populatedRoom,
    })
  } catch (error) {
    handleError(res, error, "Failed to create chat room")
  }
})

app.get("/api/chat/rooms/:roomId/messages", authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params
    const { page = 1, limit = 50 } = req.query
    const userId = req.user.userId

    // Verify user is participant
    const room = await ChatRoom.findById(roomId)
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this chat room",
      })
    }

    const messages = await Message.find({ chatRoom: roomId })
      .populate("sender", "name role")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Message.countDocuments({ chatRoom: roomId })

    res.json({
      success: true,
      messages: messages.reverse(),
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch messages")
  }
})

app.post("/api/chat/rooms/:roomId/messages", authenticateToken, upload.array("attachments", 3), async (req, res) => {
  try {
    const { roomId } = req.params
    const { content, type } = req.body
    const userId = req.user.userId

    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        error: "Message content or attachments are required",
      })
    }

    // Verify user is participant
    const room = await ChatRoom.findById(roomId)
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this chat room",
      })
    }

    const attachments =
      req.files?.map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
      })) || []

    const message = new Message({
      chatRoom: roomId,
      sender: userId,
      content: content || "",
      type: type || "text",
      attachments,
    })

    await message.save()

    // Update room last activity and last message
    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: message._id,
      lastActivity: new Date(),
    })

    const populatedMessage = await Message.findById(message._id).populate("sender", "name role")

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
    })
  } catch (error) {
    handleError(res, error, "Failed to send message")
  }
})

app.get('/api/notifications/attachment/:notificationId/:filename', authenticateToken, async (req, res) => {
  try {
    const { notificationId, filename } = req.params;
    const notification = await Notification.findById(notificationId);
    if (!notification) return res.status(404).json({ error: "Notificación no encontrada" });

    // Buscar attachment que coincida con filename
    const attachment = notification.attachments.find(a => {
      try {
        const urlObj = new URL(a.url);
        const pathname = urlObj.pathname;
        const pathParts = pathname.split('/');
        const fileNameFromUrl = pathParts[pathParts.length - 1];
        return fileNameFromUrl === filename;
      } catch {
        return false;
      }
    });

    if (!attachment) return res.status(404).json({ error: "Attachment no encontrado" });

    // Redirigir directo a la URL pública fija
    res.redirect(attachment.url);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});



app.get("/api/chat/private/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId
    const targetUserId = req.params.userId

    if (currentUserId === targetUserId) {
      return res.status(400).json({
        success: false,
        error: "Cannot create private chat with yourself",
      })
    }

    // Check if private room already exists
    let room = await ChatRoom.findOne({
      type: "private",
      participants: { $all: [currentUserId, targetUserId], $size: 2 },
    })
      .populate("participants", "name role")
      .populate("lastMessage")

    if (!room) {
      // Create new private room
      const targetUser = await User.findById(targetUserId)
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: "Target user not found",
        })
      }

      room = new ChatRoom({
        name: `Private chat`,
        type: "private",
        participants: [currentUserId, targetUserId],
        createdBy: currentUserId,
      })

      await room.save()

      room = await ChatRoom.findById(room._id).populate("participants", "name role").populate("lastMessage")
    }

    res.json({
      success: true,
      room,
    })
  } catch (error) {
    handleError(res, error, "Failed to get or create private chat")
  }
})

// Specific Chat Routes for Frontend Compatibility
app.get("/api/chat/group", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    // Find or create group chat room
    let groupRoom = await ChatRoom.findOne({
      type: "group",
      name: "Equipo de Ventas",
    }).populate("participants", "name role")

    if (!groupRoom) {
      // Create group chat room with all users
      const allUsers = await User.find({ isActive: true }).select("_id")
      const participantIds = allUsers.map((user) => user._id)

      groupRoom = new ChatRoom({
        name: "Equipo de Ventas",
        type: "group",
        participants: participantIds,
        createdBy: userId,
      })

      await groupRoom.save()

      groupRoom = await ChatRoom.findById(groupRoom._id).populate("participants", "name role")
    } else {
      // Add user to group if not already a participant
      if (!groupRoom.participants.some((p) => p._id.toString() === userId.toString())) {
        groupRoom.participants.push(userId)
        await groupRoom.save()
        groupRoom = await ChatRoom.findById(groupRoom._id).populate("participants", "name role")
      }
    }

    res.json({
      success: true,
      chatRoom: groupRoom,
    })
  } catch (error) {
    handleError(res, error, "Failed to get group chat")
  }
})

app.get("/api/chat/private-admin", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    if (req.user.role === "admin") {
      return res.status(400).json({
        success: false,
        error: "Admins should use private-chats endpoint",
      })
    }

    // Find admin user
    const admin = await User.findOne({ role: "admin" })
    if (!admin) {
      return res.status(404).json({
        success: false,
        error: "No admin found",
      })
    }

    // Find or create private chat with admin
    let privateRoom = await ChatRoom.findOne({
      type: "private",
      participants: { $all: [userId, admin._id], $size: 2 },
    }).populate("participants", "name role")

    if (!privateRoom) {
      privateRoom = new ChatRoom({
        name: "Chat con Admin",
        type: "private",
        participants: [userId, admin._id],
        createdBy: userId,
      })

      await privateRoom.save()
      privateRoom = await ChatRoom.findById(privateRoom._id).populate("participants", "name role")
    }

    res.json({
      success: true,
      chatRoom: privateRoom,
    })
  } catch (error) {
    handleError(res, error, "Failed to get private chat with admin")
  }
})

app.get("/api/chat/private-chats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.userId

    // Get all private chats where admin is a participant
    const privateChats = await ChatRoom.find({
      type: "private",
      participants: adminId,
    })
      .populate("participants", "name role email")
      .populate("lastMessage")
      .sort({ lastActivity: -1 })

    res.json({
      success: true,
      chatRooms: privateChats,
    })
  } catch (error) {
    handleError(res, error, "Failed to get private chats")
  }
})

// Update existing message routes to match frontend expectations
app.get("/api/chat/:chatRoomId/messages", authenticateToken, async (req, res) => {
  try {
    const { chatRoomId } = req.params
    const { page = 1, limit = 50 } = req.query
    const userId = req.user.userId

    // Verify user is participant
    const room = await ChatRoom.findById(chatRoomId)
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this chat room",
      })
    }

    const messages = await Message.find({ chatRoom: chatRoomId })
      .populate("sender", "name role")
      .sort({ createdAt: 1 }) // Ascending order for chat
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Message.countDocuments({ chatRoom: chatRoomId })

    res.json({
      success: true,
      messages,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch messages")
  }
})

app.post("/api/chat/:chatRoomId/messages", authenticateToken, async (req, res) => {
  try {
    const { chatRoomId } = req.params
    const { content } = req.body
    const userId = req.user.userId

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message content is required",
      })
    }

    // Verify user is participant
    const room = await ChatRoom.findById(chatRoomId)
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this chat room",
      })
    }

    const message = new Message({
      chatRoom: chatRoomId,
      sender: userId,
      content: content.trim(),
      type: "text",
    })

    await message.save()

    // Update room last activity and last message
    await ChatRoom.findByIdAndUpdate(chatRoomId, {
      lastMessage: message._id,
      lastActivity: new Date(),
    })

    const populatedMessage = await Message.findById(message._id).populate("sender", "name role")

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
    })
  } catch (error) {
    handleError(res, error, "Failed to send message")
  }
})

app.put("/api/chat/:chatRoomId/read", authenticateToken, async (req, res) => {
  try {
    const { chatRoomId } = req.params
    const userId = req.user.userId

    // Mark all messages in this chat as read by this user
    await Message.updateMany(
      {
        chatRoom: chatRoomId,
        "readBy.userId": { $ne: userId },
      },
      {
        $push: {
          readBy: {
            userId: userId,
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
    handleError(res, error, "Failed to mark messages as read")
  }
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
