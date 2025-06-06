const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const dotenv = require("dotenv")

dotenv.config()

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sales_management", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// Updated Schemas
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    role: { type: String, enum: ["seller", "admin"], default: "seller" },
    commissionRate: { type: Number, default: 0.05, min: 0, max: 1 },
    isActive: { type: Boolean, default: true },
    totalSales: { type: Number, default: 0 },
    totalCommissions: { type: Number, default: 0 },
  },
  { timestamps: true },
)

const saleSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerName: { type: String, required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    planName: { type: String, required: true },
    planPrice: { type: Number, required: true, min: 0 },
    commission: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, required: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: ["pending", "completed", "cancelled"], default: "completed" },
    customerInfo: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      dni: { type: String, required: true },
      address: {
        street: { type: String, required: true },
        number: { type: String, required: true },
        city: { type: String, required: true },
        province: { type: String, required: true },
        postalCode: { type: String, required: true },
      },
    },
  },
  { timestamps: true },
)

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    features: [String],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
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
    const adminPassword = await bcrypt.hash("admin123456", 10)
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
      },
      {
        name: "Plan Profesional",
        description: "Plan completo para profesionales y pequeñas empresas",
        price: 599.99,
        features: ["Acceso completo", "Soporte prioritario", "5 usuarios", "Reportes avanzados"],
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
      },
      {
        name: "Plan Premium",
        description: "Plan premium con características exclusivas",
        price: 899.99,
        features: ["Acceso premium", "Soporte telefónico", "10 usuarios", "Analytics avanzados"],
      },
    ]

    const plans = []
    for (const planData of samplePlans) {
      const plan = new Plan({
        ...planData,
        createdBy: admin._id,
      })
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
      const hashedPassword = await bcrypt.hash("seller123", 10)
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
  } finally {
    mongoose.connection.close()
  }
}

// Run seeding
seedDatabase()
