const mongoose = require("mongoose")
const dotenv = require("dotenv")

dotenv.config()

async function simpleSetup() {
  try {
    console.log("🔗 Connecting to MongoDB...")

    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sales_management", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })

    console.log("✅ Connected to MongoDB")

    // Simple schemas for basic setup
    const userSchema = new mongoose.Schema(
      {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        phone: { type: String, required: true },
        location: { type: String, required: true },
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
        amount: { type: Number, required: true },
        commission: { type: Number, required: true },
        commissionRate: { type: Number, required: true },
        description: { type: String, required: true },
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
        commissionRate: { type: Number, required: true },
        monthlyFee: { type: Number, required: true },
        features: [String],
        isActive: { type: Boolean, default: true },
      },
      { timestamps: true },
    )

    // Create models (this will create collections)
    const User = mongoose.model("User", userSchema)
    const Sale = mongoose.model("Sale", saleSchema)
    const Plan = mongoose.model("Plan", planSchema)

    console.log("📋 Collections created with Mongoose schemas")

    // Create basic indexes
    await User.collection.createIndex({ email: 1 }, { unique: true })
    await Sale.collection.createIndex({ sellerId: 1 })
    await Sale.collection.createIndex({ createdAt: -1 })
    await Plan.collection.createIndex({ key: 1 }, { unique: true })

    console.log("🔍 Basic indexes created")

    console.log("\n🎉 Simple MongoDB setup completed!")
    console.log("📝 Next steps:")
    console.log("   1. Run 'npm run seed' to populate with sample data")
    console.log("   2. Run 'npm run dev' to start the server")
  } catch (error) {
    console.error("❌ Error in simple setup:", error)
  } finally {
    await mongoose.connection.close()
    console.log("🔌 Database connection closed")
  }
}

simpleSetup()
