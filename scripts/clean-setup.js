const mongoose = require("mongoose")
const dotenv = require("dotenv")

dotenv.config()

async function cleanSetup() {
  try {
    console.log("🔗 Connecting to MongoDB...")

    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sales_management", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })

    console.log("✅ Connected to MongoDB")

    const db = mongoose.connection.db

    // Drop the entire database to start fresh
    console.log("🗑️  Dropping existing database...")
    await db.dropDatabase()

    console.log("📋 Creating fresh collections...")

    // Create collections without strict validation first
    await db.createCollection("users")
    await db.createCollection("sales")
    await db.createCollection("plans")

    console.log("🔍 Creating basic indexes...")

    // Create basic indexes
    await db.collection("users").createIndex({ email: 1 }, { unique: true })
    await db.collection("sales").createIndex({ sellerId: 1 })
    await db.collection("sales").createIndex({ createdAt: -1 })
    await db.collection("plans").createIndex({ createdBy: 1 })

    console.log("✅ Clean setup completed!")
    console.log("📝 Next step: Run 'npm run seed-fixed' to populate with data")
  } catch (error) {
    console.error("❌ Error in clean setup:", error)
  } finally {
    await mongoose.connection.close()
    console.log("🔌 Database connection closed")
  }
}

cleanSetup()
