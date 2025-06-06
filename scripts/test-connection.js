const mongoose = require("mongoose")
require("dotenv").config()

async function testConnection() {
  try {
    console.log("🔄 Testing MongoDB connection...")
    console.log("📍 URI:", process.env.MONGODB_URI?.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@"))

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
    })

    console.log("✅ Connection successful!")
    console.log("📊 Database:", conn.connection.name)
    console.log("🌐 Host:", conn.connection.host)

    // Test basic operations
    const collections = await mongoose.connection.db.listCollections().toArray()
    console.log("📋 Collections:", collections.map((c) => c.name).join(", ") || "None")

    // Test a simple query
    const adminDb = mongoose.connection.db.admin()
    const result = await adminDb.ping()
    console.log("🏓 Ping result:", result)

    await mongoose.disconnect()
    console.log("✅ Test completed successfully!")
    process.exit(0)
  } catch (error) {
    console.error("❌ Connection failed:", error.message)

    if (error.name === "MongoServerSelectionError") {
      console.error("\n💡 Troubleshooting tips:")
      console.error("1. Check your internet connection")
      console.error("2. Verify your MongoDB Atlas cluster is running")
      console.error("3. Check if your IP address is whitelisted")
      console.error("4. Verify your username and password")
      console.error("5. Make sure the database name is correct")
    }

    process.exit(1)
  }
}

testConnection()
