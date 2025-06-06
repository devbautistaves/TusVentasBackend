// Script para verificar el estado de la base de datos
const mongoose = require("mongoose")

// Conectar a MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sales_management", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`)
    return conn
  } catch (error) {
    console.error("❌ MongoDB connection error:", error)
    process.exit(1)
  }
}

const checkDatabase = async () => {
  console.log("🔍 Verificando estado de la base de datos...")

  await connectDB()

  // Verificar colecciones
  const collections = await mongoose.connection.db.listCollections().toArray()
  console.log(
    "📊 Colecciones encontradas:",
    collections.map((c) => c.name),
  )

  // Verificar usuarios
  const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }))
  const users = await User.find({}).select("name email role")
  console.log("👥 Usuarios en la base de datos:")
  users.forEach((user) => {
    console.log(`  - ${user.name} (${user.email}) - ${user.role}`)
  })

  // Verificar ventas
  const Sale = mongoose.model("Sale", new mongoose.Schema({}, { strict: false }))
  const salesCount = await Sale.countDocuments()
  console.log(`💰 Total de ventas: ${salesCount}`)

  // Verificar planes
  const Plan = mongoose.model("Plan", new mongoose.Schema({}, { strict: false }))
  const plansCount = await Plan.countDocuments()
  console.log(`📋 Total de planes: ${plansCount}`)

  mongoose.connection.close()
  console.log("✅ Verificación completada")
}

checkDatabase().catch(console.error)
