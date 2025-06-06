const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const dotenv = require("dotenv")

dotenv.config()

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sales_management", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// Updated Schemas - exactly matching server.js
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
      default: 0.05,
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
        values: ["pending", "completed", "cancelled"],
        message: "Status must be pending, completed, or cancelled",
      },
      default: "completed",
    },
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

const User = mongoose.model("User", userSchema)
const Sale = mongoose.model("Sale", saleSchema)
const Plan = mongoose.model("Plan", planSchema)

async function seedDatabase() {
  try {
    console.log("🌱 Starting database seeding...")

    // Clear existing data
    await User.deleteMany({})
    await Sale.deleteMany({})
    await Plan.deleteMany({})

    console.log("🗑️  Cleared existing data")

    // Create Admin User
    const adminPassword = await bcrypt.hash("admin123456", 12)
    const admin = new User({
      name: "Administrator",
      email: "admin@salesmanagement.com",
      password: adminPassword,
      phone: "+1234567890",
      location: "Head Office",
      role: "admin",
      commissionRate: 0.15, // 15% for admin
    })
    await admin.save()

    console.log("👤 Created admin user")

    // Create Sample Plans
    const samplePlans = [
      {
        name: "Plan Básico",
        description: "Plan ideal para empezar con funcionalidades esenciales",
        price: 299.99,
        features: ["Acceso básico", "Soporte por email", "1 usuario"],
        createdBy: admin._id,
      },
      {
        name: "Plan Profesional",
        description: "Plan completo para profesionales y pequeñas empresas",
        price: 599.99,
        features: ["Acceso completo", "Soporte prioritario", "5 usuarios", "Reportes avanzados"],
        createdBy: admin._id,
      },
      {
        name: "Plan Enterprise",
        description: "Solución empresarial con todas las funcionalidades",
        price: 1299.99,
        features: [
          "Acceso ilimitado",
          "Soporte 24/7",
          "Usuarios ilimitados",
          "API personalizada",
          "Integración completa",
        ],
        createdBy: admin._id,
      },
      {
        name: "Plan Premium",
        description: "Plan premium con características exclusivas",
        price: 899.99,
        features: ["Acceso premium", "Soporte telefónico", "10 usuarios", "Analytics avanzados"],
        createdBy: admin._id,
      },
    ]

    const plans = []
    for (const planData of samplePlans) {
      const plan = new Plan(planData)
      plans.push(await plan.save())
    }

    console.log("📋 Created sample plans")

    // Create Sample Sellers with different commission rates
    const sellers = []
    const sampleSellers = [
      {
        name: "Juan Pérez",
        email: "juan.perez@email.com",
        phone: "+54911234567",
        location: "Buenos Aires",
        commissionRate: 0.08, // 8%
      },
      {
        name: "María González",
        email: "maria.gonzalez@email.com",
        phone: "+54911234568",
        location: "Córdoba",
        commissionRate: 0.05, // 5%
      },
      {
        name: "Carlos Rodríguez",
        email: "carlos.rodriguez@email.com",
        phone: "+54911234569",
        location: "Rosario",
        commissionRate: 0.12, // 12%
      },
      {
        name: "Ana Martínez",
        email: "ana.martinez@email.com",
        phone: "+54911234570",
        location: "Mendoza",
        commissionRate: 0.07, // 7%
      },
      {
        name: "Luis Fernández",
        email: "luis.fernandez@email.com",
        phone: "+54911234571",
        location: "La Plata",
        commissionRate: 0.06, // 6%
      },
    ]

    for (const sellerData of sampleSellers) {
      const hashedPassword = await bcrypt.hash("seller123", 12)
      const seller = new User({
        ...sellerData,
        password: hashedPassword,
        role: "seller",
      })
      sellers.push(await seller.save())
    }

    console.log("👥 Created sample sellers")

    // Create Sample Sales
    const sampleSales = []
    const saleDescriptions = [
      "Venta plan básico - Cliente nuevo",
      "Upgrade a plan profesional",
      "Renovación plan enterprise",
      "Venta plan premium - Referido",
      "Migración desde competencia",
      "Expansión de licencias",
      "Venta corporativa",
      "Cliente recuperado",
      "Venta cruzada",
      "Upselling exitoso",
    ]

    const provinces = ["Buenos Aires", "Córdoba", "Santa Fe", "Mendoza", "Tucumán"]
    const cities = ["CABA", "La Plata", "Córdoba", "Rosario", "Mendoza"]
    const streets = ["Av. Corrientes", "Av. Santa Fe", "Av. Rivadavia", "Av. Cabildo", "Av. 9 de Julio"]

    for (let i = 0; i < 60; i++) {
      const seller = sellers[Math.floor(Math.random() * sellers.length)]
      const plan = plans[Math.floor(Math.random() * plans.length)]
      const commission = plan.price * seller.commissionRate

      // Random date within last 6 months
      const randomDate = new Date()
      randomDate.setDate(randomDate.getDate() - Math.floor(Math.random() * 180))

      const sale = new Sale({
        sellerId: seller._id,
        sellerName: seller.name,
        planId: plan._id,
        planName: plan.name,
        planPrice: plan.price,
        commission: commission,
        commissionRate: seller.commissionRate,
        description: saleDescriptions[Math.floor(Math.random() * saleDescriptions.length)],
        status: Math.random() > 0.1 ? "completed" : Math.random() > 0.5 ? "pending" : "cancelled",
        customerInfo: {
          name: `Cliente ${i + 1}`,
          email: `cliente${i + 1}@email.com`,
          phone: `+5491123456${String(i).padStart(2, "0")}`,
          dni: `${Math.floor(Math.random() * 90000000) + 10000000}`,
          address: {
            street: streets[Math.floor(Math.random() * streets.length)],
            number: `${Math.floor(Math.random() * 9000) + 1000}`,
            city: cities[Math.floor(Math.random() * cities.length)],
            province: provinces[Math.floor(Math.random() * provinces.length)],
            postalCode: `${Math.floor(Math.random() * 9000) + 1000}`,
          },
        },
        createdAt: randomDate,
      })

      sampleSales.push(await sale.save())

      // Update seller totals only for completed sales
      if (sale.status === "completed") {
        await User.findByIdAndUpdate(seller._id, {
          $inc: {
            totalSales: plan.price,
            totalCommissions: commission,
          },
        })
      }
    }

    console.log("💰 Created sample sales")

    // Display summary
    const totalUsers = await User.countDocuments()
    const totalSales = await Sale.countDocuments()
    const totalPlans = await Plan.countDocuments()
    const totalSalesAmount = await Sale.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$planPrice" } } },
    ])
    const totalCommissions = await Sale.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$commission" } } },
    ])

    console.log("\n🎉 Database seeding completed successfully!")
    console.log("📊 Summary:")
    console.log(`   Users: ${totalUsers} (1 admin, ${totalUsers - 1} sellers)`)
    console.log(`   Plans: ${totalPlans}`)
    console.log(`   Sales: ${totalSales}`)
    console.log(`   Total Sales Amount: $${totalSalesAmount[0]?.total?.toFixed(2) || "0.00"}`)
    console.log(`   Total Commissions: $${totalCommissions[0]?.total?.toFixed(2) || "0.00"}`)
    console.log("\n🔑 Admin Credentials:")
    console.log("   Email: admin@salesmanagement.com")
    console.log("   Password: admin123456")
    console.log("\n🔑 Sample Seller Credentials:")
    console.log("   Email: juan.perez@email.com (or any other seller email)")
    console.log("   Password: seller123")
    console.log("\n📋 Sample Plans Created:")
    for (const plan of plans) {
      console.log(`   - ${plan.name}: $${plan.price}`)
    }
  } catch (error) {
    console.error("❌ Error seeding database:", error)

    // More detailed error information
    if (error.name === "ValidationError") {
      console.error("Validation errors:")
      Object.values(error.errors).forEach((err) => {
        console.error(`  - ${err.path}: ${err.message}`)
      })
    }
  } finally {
    mongoose.connection.close()
  }
}

// Run seeding
seedDatabase()
