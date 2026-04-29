const mongoose = require("mongoose")

// Almacenar conexiones por tenant
const connections = {}

const getConnectionUri = (tenantId) => {
  // Si es demo, usar MONGODB_URI_DEMO
  if (tenantId === 'demo' || tenantId === 'ventas_system') {
    return process.env.MONGODB_URI_DEMO || process.env.MONGODB_URI
  }
  // Por defecto usar la URI principal (sales_management)
  return process.env.MONGODB_URI
}

const connectDB = async (tenantId = 'default') => {
  try {
    // Si ya existe una conexión para este tenant, retornarla
    if (connections[tenantId] && connections[tenantId].readyState === 1) {
      return connections[tenantId]
    }

    const uri = getConnectionUri(tenantId)
    
    // Configuración de opciones de conexión
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      w: "majority",
    }

    // Crear nueva conexión
    const conn = await mongoose.createConnection(uri, options)
    
    // Almacenar la conexión
    connections[tenantId] = conn

    const dbName = conn.name
    console.log(`✅ MongoDB Connected for tenant: ${tenantId}`)
    console.log(`📊 Database: ${dbName}`)
    console.log(`🌐 Host: ${conn.host}`)

    // Event listeners
    conn.on("error", (err) => {
      console.error(`❌ MongoDB connection error for ${tenantId}:`, err)
    })

    conn.on("disconnected", () => {
      console.log(`🔌 MongoDB disconnected for ${tenantId}`)
      delete connections[tenantId]
    })

    return conn
  } catch (error) {
    console.error(`❌ MongoDB connection failed for ${tenantId}:`, error.message)
    throw error
  }
}

// Función para conectar usando la conexión por defecto de mongoose (compatibilidad)
const connectDefaultDB = async () => {
  try {
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      w: "majority",
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, options)

    console.log(`✅ MongoDB Connected Successfully!`)
    console.log(`📊 Database: ${conn.connection.name}`)
    console.log(`🌐 Host: ${conn.connection.host}`)

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err)
    })

    mongoose.connection.on("disconnected", () => {
      console.log("🔌 MongoDB disconnected")
    })

    return conn
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message)
    process.exit(1)
  }
}

// Obtener conexión por tenant
const getConnection = (tenantId = 'default') => {
  return connections[tenantId] || mongoose.connection
}

module.exports = { connectDB, connectDefaultDB, getConnection, connections }
