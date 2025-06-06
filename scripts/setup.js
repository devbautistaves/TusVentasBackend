const fs = require("fs")
const path = require("path")

console.log("🔧 Setting up MongoDB connection...\n")

// Check if .env file exists
const envPath = path.join(process.cwd(), ".env")
const envExamplePath = path.join(process.cwd(), ".env.example")

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath)
    console.log("✅ Created .env file from .env.example")
  } else {
    console.log("❌ No .env file found. Please create one with your MongoDB credentials.")
  }
} else {
  console.log("✅ .env file exists")
}

// Create uploads directory
const uploadsDir = path.join(process.cwd(), "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
  console.log("✅ Created uploads directory")
} else {
  console.log("✅ Uploads directory exists")
}

// Create config directory
const configDir = path.join(process.cwd(), "config")
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true })
  console.log("✅ Created config directory")
} else {
  console.log("✅ Config directory exists")
}

console.log("\n🎉 Setup completed!")
console.log("\n📝 Next steps:")
console.log("1. Update your .env file with your actual MongoDB Atlas credentials")
console.log("2. Run: node scripts/test-connection.js to test your connection")
console.log("3. Start your server: npm start or node server.js")
console.log("\n💡 Make sure to:")
console.log("- Whitelist your IP address in MongoDB Atlas")
console.log("- Use the correct database name in your connection string")
console.log("- Verify your username and password")
