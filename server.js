const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

const multer = require("multer")
const path = require("path")
const fs = require("fs")

const app = express()
const PORT = process.env.PORT || 5000

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// Security middleware

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
      dniPhoto: {
        type: String,
        required: [true, "DNI photo is required"],
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

// Import new schemas
const Notification = require("./models/Notification")
const ChatRoom = require("./models/ChatRoom")
const Message = require("./models/Message")

// Models
const User = mongoose.model("User", userSchema)
const Sale = mongoose.model("Sale", saleSchema)
const Plan = mongoose.model("Plan", planSchema)

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, "dni-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error("Solo se permiten archivos de imagen (jpeg, jpg, png, gif)"))
    }
  },
})

// Import middleware
const { authenticateToken, requireAdmin } = require("./middleware/auth")

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
      commissionRate: 0.05,
    })

    await user.save()

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
app.post("/api/sales", authenticateToken, upload.single("dniPhoto"), async (req, res) => {
  try {
    console.log("Creating sale - User:", req.user.userId)

    const { planId, description } = req.body
    let customerInfo = req.body.customerInfo

    if (!planId || !description || !customerInfo) {
      return res.status(400).json({
        success: false,
        error: "Plan, description and customer info are required",
      })
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "DNI photo is required",
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
    customerInfo.dniPhoto = req.file.filename

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
    console.log("Sale created successfully:", sale._id)

    await User.findByIdAndUpdate(user._id, {
      $inc: {
        totalSales: plan.price,
        totalCommissions: commission,
      },
    })

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
    const { status, notes } = req.body
    const { id } = req.params

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      })
    }

    const validStatuses = ["pending", "completed", "cancelled", "installed", "pending_appointment", "appointed"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status value",
        validValues: validStatuses,
      })
    }

    const sale = await Sale.findById(id)
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: "Sale not found",
      })
    }

    sale.statusHistory.push({
      status,
      changedBy: req.user.userId,
      changedAt: new Date(),
      notes: notes || "",
    })

    sale.status = status
    await sale.save()

    res.json({
      success: true,
      message: "Sale status updated successfully",
      sale,
    })
  } catch (error) {
    handleError(res, error, "Failed to update sale status")
  }
})

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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
