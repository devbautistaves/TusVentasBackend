const mongoose = require("mongoose")

const connectDB = async () => {
  try {
    // Configuración de opciones de conexión
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // Mantener hasta 10 conexiones socket
      serverSelectionTimeoutMS: 5000, // Mantener intentando enviar operaciones por 5 segundos
      socketTimeoutMS: 45000, // Cerrar sockets después de 45 segundos de inactividad
      family: 4, // Usar IPv4, saltar IPv6
      retryWrites: true,
      w: "majority",
    }

    // Limpiar conexiones existentes
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }

    // Conectar a MongoDB
    const conn = await mongoose.connect(process.env.MONGODB_URI, options)

    console.log(`✅ MongoDB Connected Successfully!`)
    console.log(`📊 Database: ${conn.connection.name}`)
    console.log(`🌐 Host: ${conn.connection.host}`)
    console.log(`🔌 Port: ${conn.connection.port}`)

    // Verificar la conexión listando las colecciones
    try {
      const collections = await mongoose.connection.db.listCollections().toArray()
      console.log(`📋 Collections found: ${collections.map((c) => c.name).join(", ") || "None"}`)
    } catch (error) {
      console.log("📋 Collections: Unable to list (this is normal for new databases)")
    }

    // Event listeners para la conexión
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err)
    })

    mongoose.connection.on("disconnected", () => {
      console.log("🔌 MongoDB disconnected")
    })

    mongoose.connection.on("reconnected", () => {
      console.log("🔄 MongoDB reconnected")
    })

    return conn
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message)

    // Mostrar detalles específicos del error
    if (error.name === "MongoServerSelectionError") {
      console.error("💡 Possible solutions:")
      console.error("   - Check your internet connection")
      console.error("   - Verify MongoDB Atlas cluster is running")
      console.error("   - Check if your IP is whitelisted in MongoDB Atlas")
      console.error("   - Verify your username and password")
    }

    process.exit(1)
  }
}

module.exports = connectDB
