const jwt = require("jsonwebtoken")
const User = require("../models/User")

// JWT Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1]

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Access token required",
        code: "NO_TOKEN",
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key")

    const user = await User.findById(decoded.userId).select("-password")
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found",
        code: "USER_NOT_FOUND",
      })
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: "Account is deactivated",
        code: "ACCOUNT_DEACTIVATED",
      })
    }

    req.user = {
      userId: user._id,
      email: user.email,
      role: user.role,
      commissionRate: user.commissionRate,
    }

    next()
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({
        success: false,
        error: "Invalid token",
        code: "INVALID_TOKEN",
      })
    }

    if (error.name === "TokenExpiredError") {
      return res.status(403).json({
        success: false,
        error: "Token expired",
        code: "TOKEN_EXPIRED",
      })
    }

    console.error("Auth middleware error:", error)
    res.status(500).json({
      success: false,
      error: "Authentication error",
      code: "AUTH_ERROR",
    })
  }
}

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    })
  }
  next()
}

module.exports = { authenticateToken, requireAdmin }
