const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const dotenv = require("dotenv")

dotenv.config()

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sales_management", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// Schemas (same as in server.js)
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    role: { type: String, enum: ["seller", "admin"], default: "seller" },
    plan: { type: String, enum: ["basic", "premium", "enterprise"], default: "basic" },
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
    amount: { type: Number, required: true, min: 0 },
    commission: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, required: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: ["pending", "completed", "cancelled"], default: "completed" },
    paymentMethod: { type: String, enum: ["cash", "card", "transfer", "other"], default: "cash" },
    customerInfo: {
      name: String,
      email: String,
      phone: String,
    },
  },
  { timestamps: true },
)

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    key: { type: String, required: true, unique: true },
    commissionRate: { type: Number, required: true, min: 0, max: 1 },
    monthlyFee: { type: Number, required: true, min: 0 },
    features: [String],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

const User = mongoose.model("User", userSchema)
const Sale = mongoose.model("Sale", saleSchema)
const Plan = mongoose.model("Plan", planSchema)

const PLANS = {
  basic: { name: "Básico", commissionRate: 0.05, monthlyFee: 0 },
  premium: { name: "Premium", commissionRate: 0.08, monthlyFee: 29 },
  enterprise: { name: "Enterprise", commissionRate: 0.12, monthlyFee: 99 },
}

async function seedDatabase() {
  try {
    console.log("🌱 Starting database seeding...")

    // Clear existing data
    await User.deleteMany({})
    await Sale.deleteMany({})
    await Plan.deleteMany({})

    console.log("🗑️  Cleared existing data")

    // Create Plans
    const plans = []
    for (const [key, planData] of Object.entries(PLANS)) {
      const plan = new Plan({
        name: planData.name,
        key: key,
        commissionRate: planData.commissionRate,
        monthlyFee: planData.monthlyFee,
        features: [
          `${(planData.commissionRate * 100).toFixed(0)}% commission rate`,
          planData.monthlyFee === 0 ? "Free plan" : `$${planData.monthlyFee}/month`,
          "Sales tracking",
          "Commission calculator",
          key === "enterprise" ? "Priority support" : "Standard support",
        ],
        isActive: true,
      })
      plans.push(await plan.save())
    }

    console.log("📋 Created plans")

    // Create Admin User
    const adminPassword = await bcrypt.hash("admin123456", 10)
    const admin = new User({
      name: "Administrator",
      email: "admin@salesmanagement.com",
      password: adminPassword,
      phone: "+1234567890",
      location: "Head Office",
      role: "admin",
      plan: "enterprise",
    })
    await admin.save()

    console.log("👤 Created admin user")

    // Create Sample Sellers
    const sellers = []
    const sampleSellers = [
      {
        name: "Juan Pérez",
        email: "juan.perez@email.com",
        phone: "+54911234567",
        location: "Buenos Aires",
        plan: "premium",
      },
      {
        name: "María González",
        email: "maria.gonzalez@email.com",
        phone: "+54911234568",
        location: "Córdoba",
        plan: "basic",
      },
      {
        name: "Carlos Rodríguez",
        email: "carlos.rodriguez@email.com",
        phone: "+54911234569",
        location: "Rosario",
        plan: "enterprise",
      },
      {
        name: "Ana Martínez",
        email: "ana.martinez@email.com",
        phone: "+54911234570",
        location: "Mendoza",
        plan: "premium",
      },
      {
        name: "Luis Fernández",
        email: "luis.fernandez@email.com",
        phone: "+54911234571",
        location: "La Plata",
        plan: "basic",
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
      "Venta de producto A",
      "Servicio de consultoría",
      "Venta de software",
      "Capacitación empresarial",
      "Producto premium",
      "Servicio técnico",
      "Venta mayorista",
      "Consultoría especializada",
      "Producto básico",
      "Servicio de mantenimiento",
    ]

    const paymentMethods = ["cash", "card", "transfer"]
    const statuses = ["completed", "completed", "completed", "pending", "cancelled"]

    for (let i = 0; i < 50; i++) {
      const seller = sellers[Math.floor(Math.random() * sellers.length)]
      const amount = Math.floor(Math.random() * 5000) + 100 // $100 - $5100
      const commissionRate = PLANS[seller.plan].commissionRate
      const commission = amount * commissionRate

      // Random date within last 3 months
      const randomDate = new Date()
      randomDate.setDate(randomDate.getDate() - Math.floor(Math.random() * 90))

      const sale = new Sale({
        sellerId: seller._id,
        sellerName: seller.name,
        amount: amount,
        commission: commission,
        commissionRate: commissionRate,
        description: saleDescriptions[Math.floor(Math.random() * saleDescriptions.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        customerInfo: {
          name: `Cliente ${i + 1}`,
          email: `cliente${i + 1}@email.com`,
          phone: `+5491123456${String(i).padStart(2, "0")}`,
        },
        createdAt: randomDate,
      })

      sampleSales.push(await sale.save())

      // Update seller totals
      if (sale.status === "completed") {
        await User.findByIdAndUpdate(seller._id, {
          $inc: {
            totalSales: amount,
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
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    const totalCommissions = await Sale.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$commission" } } },
    ])

    console.log("\n🎉 Database seeding completed successfully!")
    console.log("📊 Summary:")
    console.log(`   Users: ${totalUsers} (1 admin, ${totalUsers - 1} sellers)`)
    console.log(`   Sales: ${totalSales}`)
    console.log(`   Plans: ${totalPlans}`)
    console.log(`   Total Sales Amount: $${totalSalesAmount[0]?.total?.toFixed(2) || "0.00"}`)
    console.log(`   Total Commissions: $${totalCommissions[0]?.total?.toFixed(2) || "0.00"}`)
    console.log("\n🔑 Admin Credentials:")
    console.log("   Email: admin@salesmanagement.com")
    console.log("   Password: admin123456")
    console.log("\n🔑 Sample Seller Credentials:")
    console.log("   Email: juan.perez@email.com (or any other seller email)")
    console.log("   Password: seller123")
  } catch (error) {
    console.error("❌ Error seeding database:", error)
  } finally {
    mongoose.connection.close()
  }
}

// Run seeding
seedDatabase()
