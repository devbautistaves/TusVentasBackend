const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
require("dotenv").config()
const axios = require('axios')
const nodemailer = require('nodemailer');
const authenticateToken = require("./middleware/auth")


const multer = require("multer")
const path = require("path")
const fs = require("fs")
const bucket = require('./firebaseAdmin');



const app = express()
const PORT = 3000


const CHAT_ID = '-1002813962725'; // tu chat_id


async function enviarMensajeTelegram(texto) {
  try {
    if (!process.env.TELEGRAM_TOKEN) {
      return; // Silenciosamente saltar si no hay token
    }
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Error enviando mensaje de Telegram:', error.message);
    // No propagar el error para no afectar el endpoint
  }
}

// Configuracion de nodemailer para enviar emails
let transporter = null;
try {
  if (process.env.EMAIL_SMTP && process.env.PASSWORD_SMTP) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_SMTP,
        pass: process.env.PASSWORD_SMTP,
      },
    });
    console.log('Nodemailer configurado correctamente con:', process.env.EMAIL_SMTP);
  } else {
    console.warn('EMAIL_SMTP o PASSWORD_SMTP no configurados. Las notificaciones por email estaran deshabilitadas.');
  }
} catch (error) {
  console.error('Error configurando nodemailer:', error);
}

async function enviarEmailNuevaVenta(sale, seller, plan) {
  try {
    // Verificar que el transporter este configurado
    if (!transporter) {
      console.log('Email transporter no configurado. Saltando envio de email de nueva venta.');
      return;
    }

    const User = mongoose.model('User');

    // Buscar admins y usuarios de soporte activos
    const recipients = await User.find({
      role: { $in: ['admin', 'support'] },
      isActive: true
    });

    if (recipients.length === 0) {
      console.log('No hay admins ni soporte para notificar');
      return;
    }
    
    console.log(`Enviando email de nueva venta a ${recipients.length} usuario(s) (admins y soporte)...`);

    // Enviar 1 mail por destinatario (admin o soporte)
    for (const recipient of recipients) {
      if (!recipient.email) continue;

      try {
        await transporter.sendMail({
          from: `"TusVentas" <${process.env.EMAIL_SMTP}>`,
          to: recipient.email,
          subject: `Nueva venta registrada: ${plan.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
              
              <div style="background-color: #1a1a2e; padding: 20px; text-align: center;">
                <h1 style="color: #f59e0b; margin: 0;">TusVentas</h1>
              </div>

              <div style="padding: 30px; background-color: #f8f9fa;">
                <h2 style="color: #1a1a2e;">Hola ${recipient.name},</h2>
                
                <p style="font-size: 16px; color: #333;">
                  Se ha registrado una nueva venta en el sistema:
                </p>

                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                  <h3 style="margin: 0 0 15px 0; color: #1a1a2e;">Detalles de la venta</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>Plan:</strong></td>
                      <td style="padding: 8px 0;">${plan.name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>Precio:</strong></td>
                      <td style="padding: 8px 0; font-weight: bold; color: #10b981;">$${plan.price}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>Vendedor:</strong></td>
                      <td style="padding: 8px 0;">${seller.name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>Comision:</strong></td>
                      <td style="padding: 8px 0;">$${sale.commission}</td>
                    </tr>
                  </table>
                </div>

                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin: 0 0 15px 0; color: #1a1a2e;">Datos del cliente</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>Nombre:</strong></td>
                      <td style="padding: 8px 0;">${sale.customerInfo.name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>Email:</strong></td>
                      <td style="padding: 8px 0;">${sale.customerInfo.email || 'No especificado'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>Telefono:</strong></td>
                      <td style="padding: 8px 0;">${sale.customerInfo.phone}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>DNI:</strong></td>
                      <td style="padding: 8px 0;">${sale.customerInfo.dni}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #666;"><strong>Direccion:</strong></td>
                      <td style="padding: 8px 0;">
                        ${sale.customerInfo.address.street} ${sale.customerInfo.address.number}, 
                        ${sale.customerInfo.address.city}, 
                        ${sale.customerInfo.address.province}
                      </td>
                    </tr>
                    ${sale.customerInfo.address.entreCalles 
                      ? `<tr>
                          <td style="padding: 8px 0; color: #666;"><strong>Entre calles:</strong></td>
                          <td style="padding: 8px 0;">${sale.customerInfo.address.entreCalles}</td>
                        </tr>` 
                      : ''}
                  </table>
                  
                  ${sale.customerInfo.address.googleMapsLink 
                    ? `<p style="margin-top: 15px;">
                        <a href="${sale.customerInfo.address.googleMapsLink}" style="color: #3b82f6;">
                          Ver ubicacion en Google Maps
                        </a>
                      </p>` 
                    : ''}
                </div>

                ${sale.customerInfo.emergencyContact?.name ? `
                <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h4 style="margin: 0 0 10px 0; color: #92400e;">Contacto de emergencia</h4>
                  <p style="margin: 0;"><strong>Nombre:</strong> ${sale.customerInfo.emergencyContact.name}</p>
                  <p style="margin: 0;"><strong>Telefono:</strong> ${sale.customerInfo.emergencyContact.phone || 'No especificado'}</p>
                </div>
                ` : ''}

                <div style="text-align: center; margin-top: 30px;">
                  <a href="https://tusventas.netlify.app"
                    style="display:inline-block; padding:12px 30px; background-color:#f59e0b; color:#1a1a2e; text-decoration:none; border-radius:6px; font-weight: bold;">
                    Ver en la plataforma
                  </a>
                </div>
              </div>

              <div style="background-color: #1a1a2e; padding: 15px; text-align: center;">
                <small style="color: #888;">Este mensaje fue enviado automaticamente por el sistema TusVentas.</small>
              </div>
            </div>
          `
        });

        console.log(`Email de nueva venta enviado a ${recipient.email} (${recipient.role})`);
      } catch (emailError) {
        console.error(`Error enviando email a ${recipient.email}:`, emailError.message);
      }
    }

  } catch (error) {
    console.error('Error enviando email de nueva venta:', error.message);
  }
}

// Funcion para enviar email de cambio de estado al dueno de la venta (vendedor)
async function enviarEmailCambioEstado(sale, previousStatus, newStatus, notes) {
  try {
    // Verificar que el transporter este configurado
    if (!transporter) {
      console.log('Email transporter no configurado. Saltando envio de email de cambio de estado.');
      return;
    }
    
    console.log(`Preparando email de cambio de estado: ${previousStatus} -> ${newStatus}`);
    
    const statusLabels = {
      pending: "Cargada",
      pending_signature: "Pendiente de Firma",
      pending_appointment: "Pendiente de Turno",
      observed: "Observada",
      appointed: "Turnada",
      completed: "Instalada",
      cancelled: "Cancelada"
    };

    const statusColors = {
      pending: "#f59e0b",
      pending_signature: "#f97316",
      pending_appointment: "#a855f7",
      observed: "#d97706",
      appointed: "#3b82f6",
      completed: "#10b981",
      cancelled: "#ef4444"
    };

    const User = mongoose.model('User');

    // Obtener el dueno de la venta (vendedor)
    const seller = await User.findById(sale.sellerId);

    if (!seller) {
      console.log('No se encontro el vendedor dueno de la venta');
      return;
    }

    if (!seller.email) {
      console.log(`El vendedor ${seller.name} no tiene email configurado`);
      return;
    }

    console.log(`Enviando email de cambio de estado a ${seller.email} (${seller.name})`);

    await transporter.sendMail({
      from: `"TusVentas" <${process.env.EMAIL_SMTP}>`,
      to: seller.email,
      subject: `Cambio de estado de venta: ${statusLabels[newStatus] || newStatus}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          
          <div style="background-color: #1a1a2e; padding: 20px; text-align: center;">
            <h1 style="color: #f59e0b; margin: 0;">TusVentas</h1>
          </div>

          <div style="padding: 30px; background-color: #f8f9fa;">
            <h2 style="color: #1a1a2e;">Hola ${seller.name},</h2>
            
            <p style="font-size: 16px; color: #333;">
              Una de tus ventas ha cambiado de estado:
            </p>

            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${statusColors[newStatus] || '#6b7280'};">
              <p style="margin: 0 0 10px 0;">
                <strong>Estado anterior:</strong> 
                <span style="background:${statusColors[previousStatus] || '#6b7280'}; color:white; padding:4px 12px; border-radius:4px; font-size: 14px;">
                  ${statusLabels[previousStatus] || previousStatus}
                </span>
              </p>
              <p style="margin: 0;">
                <strong>Nuevo estado:</strong> 
                <span style="background:${statusColors[newStatus] || '#6b7280'}; color:white; padding:4px 12px; border-radius:4px; font-size: 14px;">
                  ${statusLabels[newStatus] || newStatus}
                </span>
              </p>
            </div>

            ${notes ? `
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <strong>Nota del cambio:</strong><br/>
              ${notes}
            </div>
            ` : ''}

            <h3 style="color: #1a1a2e; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">
              Detalles de la venta
            </h3>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;"><strong>Cliente:</strong></td>
                <td style="padding: 8px 0;">${sale.customerInfo.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;"><strong>Telefono:</strong></td>
                <td style="padding: 8px 0;">${sale.customerInfo.phone}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;"><strong>Plan:</strong></td>
                <td style="padding: 8px 0;">${sale.planName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;"><strong>Direccion:</strong></td>
                <td style="padding: 8px 0;">${sale.customerInfo.address.street} ${sale.customerInfo.address.number}, ${sale.customerInfo.address.city}</td>
              </tr>
            </table>

            <div style="text-align: center; margin-top: 30px;">
              <a href="https://tusventas.netlify.app"
                style="display:inline-block; padding:12px 30px; background-color:#f59e0b; color:#1a1a2e; text-decoration:none; border-radius:6px; font-weight: bold;">
                Ver en la plataforma
              </a>
            </div>
          </div>

          <div style="background-color: #1a1a2e; padding: 15px; text-align: center;">
            <small style="color: #888;">Este mensaje fue enviado automaticamente por el sistema TusVentas.</small>
          </div>
        </div>
      `
    });

    console.log(`Email de cambio de estado enviado exitosamente a ${seller.email}`);

  } catch (error) {
    console.error('Error enviando email de cambio de estado:', error.message);
  }
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}



const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Access denied. Admin role required.",
    })
  }
  next()
}

const requireAdminOrSupervisor = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "supervisor") {
  return res.status(403).json({
  success: false,
  error: "Access denied. Admin or Supervisor role required.",
  })
  }
  next()
  }

const requireAdminOrSupport = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "support") {
  return res.status(403).json({
  success: false,
  error: "Access denied. Admin or Support role required.",
  })
  }
  next()
  }

app.put("/api/admin/sales/:id", authenticateToken, requireAdmin, (req, res) => {
  console.log("Llegó al backend:", req.params.id, req.body)
  res.json({ ok: true })
})
// Lista de statuses válidos según tu enum
const validStatuses = ["pending", "pending_signature", "pending_appointment", "observed", "appointed", "completed", "cancelled"]

app.put("/sales/:id", authenticateToken, async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  // Validar ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID inválido" })
  }

  // Validar status
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      message: `Status inválido. Debe ser uno de: ${validStatuses.join(", ")}`,
    })
  }

  try {
    // Update agresivo sólo para el status y fecha
    const updatedSale = await Sale.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true, runValidators: true },
    )

    if (!updatedSale) {
      return res.status(404).json({ message: "Venta no encontrada" })
    }

    return res.status(200).json(updatedSale)
  } catch (error) {
    console.error("Error actualizando estado:", error)
    return res.status(500).json({ message: "Error interno del servidor" })
  }
})

// CORS configuration
app.use(cors()) // 👈 ¡Solo para pruebas! No uses esto en producción

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

// MongoDB Connection with better error handling - MODIFICADO PARA MONGODB CLOUD
const connectDB = async () => {
  try {
    // Clear any existing connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }

    // Configuración específica para MongoDB Atlas Cloud
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // Mantener hasta 10 conexiones socket
      serverSelectionTimeoutMS: 10000, // Tiempo de espera para seleccionar servidor
      socketTimeoutMS: 45000, // Cerrar sockets después de 45 segundos de inactividad
      family: 4, // Usar IPv4, saltar IPv6
      retryWrites: true,
      w: "majority",
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, options)

    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`)
    console.log(`📊 Database: ${conn.connection.name}`)

    // Test the connection
    const collections = await mongoose.connection.db.listCollections().toArray()
    console.log(`📋 Collections found: ${collections.map((c) => c.name).join(", ")}`)

    // Eventos de conexi��n para MongoDB Atlas
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB Atlas connection error:", err)
    })

    mongoose.connection.on("disconnected", () => {
      console.log("🔌 MongoDB Atlas disconnected")
    })

    mongoose.connection.on("reconnected", () => {
      console.log("🔄 MongoDB Atlas reconnected")
    })
  } catch (error) {
    console.error("❌ MongoDB Atlas connection error:", error)

    // Mensajes específicos para errores comunes de MongoDB Atlas
    if (error.name === "MongoServerSelectionError") {
      console.error("💡 Posibles soluciones para MongoDB Atlas:")
      console.error("   - Verifica que tu IP esté en la lista blanca de MongoDB Atlas")
      console.error("   - Confirma que el usuario y contraseña sean correctos")
      console.error("   - Asegúrate de que el cluster esté activo")
      console.error("   - Verifica tu conexión a internet")
    }

    if (error.message.includes("authentication failed")) {
      console.error("💡 Error de autenticación:")
      console.error("   - Verifica el usuario y contraseña en MongoDB Atlas")
      console.error("   - Asegúrate de que el usuario tenga permisos de lectura/escritura")
    }

    process.exit(1)
  }
}

// Connect to database
connectDB()

// User Schema
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: ["seller", "admin", "supervisor", "support"],
        message: "Role must be seller, admin, supervisor or support",
      },
      default: "seller",
    },
    commissionRate: {
      type: Number,
      default: 0.3,
      min: [0, "Commission rate cannot be negative"],
      max: [1, "Commission rate cannot exceed 100%"],
    },
    supervisorBaseCommission: {
      type: Number,
      default: 750000,
      min: [0, "Supervisor base commission cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    totalSales: {
      type: Number,
      default: 0,
      min: [0, "Total sales cannot be negative"],
    },
    totalCommissions: {
      type: Number,
      default: 0,
      min: [0, "Total commissions cannot be negative"],
    },
  },
  {
    timestamps: true,
  },
)

// Sale Schema
const saleSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Seller ID is required"],
    },
    sellerName: {
      type: String,
      required: [true, "Seller name is required"],
    },
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: [true, "Plan ID is required"],
    },
    planName: {
      type: String,
      required: [true, "Plan name is required"],
    },
planPrice: {
  type: Number,
  required: true,
  min: [0, "Plan price must be 0 or greater"],
},
    commission: {
      type: Number,
      required: [true, "Commission is required"],
      min: [0, "Commission cannot be negative"],
    },
    commissionRate: {
      type: Number,
      required: [true, "Commission rate is required"],
      min: [0, "Commission rate cannot be negative"],
      max: [1, "Commission rate cannot exceed 100%"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "pending_signature", "pending_appointment", "observed", "appointed", "completed", "cancelled"],
        message: "Status must be one of the allowed values",
      },
      default: "pending",
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: {
            values: ["pending", "pending_signature", "pending_appointment", "observed", "appointed", "completed", "cancelled"],
          },
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        notes: {
          type: String,
          trim: true,
        },
      },
    ],
    customerInfo: {
      name: {
        type: String,
        required: [true, "Customer name is required"],
        trim: true,
        maxlength: [100, "Customer name cannot exceed 100 characters"],
      },
      email: {
        type: String,
        required: [true, "Customer email is required"],
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid customer email"],
      },
      phone: {
        type: String,
        required: [true, "Customer phone is required"],
        trim: true,
      },
      dni: {
        type: String,
        required: [true, "Customer DNI is required"],
        trim: true,
      },

      address: {
        street: {
          type: String,
          required: [true, "Street is required"],
          trim: true,
        },
        number: {
          type: String,
          required: [true, "Street number is required"],
          trim: true,
        },
        city: {
          type: String,
          required: [true, "City is required"],
          trim: true,
        },
        province: {
          type: String,
          required: [true, "Province is required"],
          trim: true,
        },
        postalCode: {
          type: String,
          required: [true, "Postal code is required"],
          trim: true,
        },
        floor: {
          type: String,
          trim: true,
        },
        apartment: {
          type: String,
          trim: true,
        },
        entreCalles: {
          type: String,
          trim: true,
        },
        googleMapsLink: {
          type: String,
          trim: true,
        },
      },
      birthDate: {
        type: String,
        trim: true,
      },
      emergencyContact: {
        name: {
          type: String,
          trim: true,
        },
        phone: {
          type: String,
          trim: true,
        },
      },
    },
    planDetail: {
      type: String,
      trim: true,
    },
    customPrice: {
      type: Number,
      min: [0, "Custom price must be 0 or greater"],
    },
    // Campos para supervisor - costos adicionales
    installationCost: {
      type: Number,
      default: 0,
      min: [0, "Installation cost must be 0 or greater"],
    },
    adminCost: {
      type: Number,
      default: 0,
      min: [0, "Admin cost must be 0 or greater"],
    },
    adCost: {
      type: Number,
      default: 0,
      min: [0, "Ad cost must be 0 or greater"],
    },
    sellerCommissionPaid: {
      type: Number,
      default: 0,
      min: [0, "Seller commission must be 0 or greater"],
    },
    paymentInfo: {
      paymentMethodAbono: {
        type: String,
        enum: ["credit_card", "cbu"],
      },
      cardBrand: {
        type: String,
        enum: ["visa", "mastercard"],
      },
      cbuNumber: {
        type: String,
        trim: true,
      },
      paymentMethodInstallation: {
        type: String,
        enum: ["transfer", "mercadopago"],
      },
    },
    // Fechas de estados para el corte mensual
    appointedDate: {
      type: Date,
      default: null,
    },
    completedDate: {
      type: Date,
      default: null,
    },
    installationCostDate: {
      type: Date,
      default: null,
    },
    // Numero de CTO para ventas activadas
    ctoNumber: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  },
)

// Plan Schema
const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
      maxlength: [100, "Plan name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Plan description is required"],
      trim: true,
      maxlength: [500, "Plan description cannot exceed 500 characters"],
    },
    price: {
      type: Number,
      required: [true, "Plan price is required"],
      min: [0.01, "Plan price must be greater than 0"],
    },
    features: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
)



// Notification Schema
const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
    },
    type: {
      type: String,
      enum: {
        values: ["info", "meeting", "document", "announcement", "training"],
        message: "Type must be one of the allowed values",
      },
      default: "info",
    },
    priority: {
      type: String,
      enum: {
        values: ["low", "medium", "high", "urgent"],
        message: "Priority must be one of the allowed values",
      },
      default: "medium",
    },
    recipients: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
attachments: [
  {
    originalName: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
  },
],

    meetingInfo: {
      date: Date,
      time: String,
      duration: Number,
      platform: {
        type: String,
        enum: ["zoom", "google-meet", "teams", "other"],
      },
      link: String,
      description: String,
    },
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

// ChatRoom Schema
const chatRoomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Chat room name is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: {
        values: ["group", "private"],
        message: "Type must be group or private",
      },
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

// Message Schema
const messageSchema = new mongoose.Schema(
  {
    chatRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      maxlength: [1000, "Message cannot exceed 1000 characters"],
    },
    type: {
      type: String,
      enum: {
        values: ["text", "file", "image"],
        message: "Type must be text, file, or image",
      },
      default: "text",
    },
attachments: [
  {
    originalName: String,
    url: String,
    size: Number,
    type: String,
  },
],
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: Date,
  },
  {
    timestamps: true,
  },
)

// SupervisorAdCost Schema - Costos de anuncio mensuales por supervisor
const supervisorAdCostSchema = new mongoose.Schema(
  {
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Supervisor ID is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      default: 0,
    },
    month: {
      type: String,
      required: [true, "Month is required"],
      match: [/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"],
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
)

// Index compuesto para asegurar un solo registro por supervisor/mes
supervisorAdCostSchema.index({ supervisorId: 1, month: 1 }, { unique: true })

// Models
const User = mongoose.model("User", userSchema)
const Sale = mongoose.model("Sale", saleSchema)
const Plan = mongoose.model("Plan", planSchema)
const Notification = mongoose.model("Notification", notificationSchema)
const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema)
const Message = mongoose.model("Message", messageSchema)
const SupervisorAdCost = mongoose.model("SupervisorAdCost", supervisorAdCostSchema)

// Configure multer for file uploads
const storage = multer.memoryStorage()
const upload = multer({ storage })

// Error handling helper
const handleError = (res, error, message = "Server error") => {
  console.error(`${message}:`, error)

  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => err.message)
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: errors,
    })
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0]
    return res.status(400).json({
      success: false,
      error: `${field} already exists`,
      code: "DUPLICATE_FIELD",
    })
  }

  res.status(500).json({
    success: false,
    error: message,
  })
}

// Routes

// Health check with database status
app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    const dbStatus = mongoose.connection.readyState
    const dbStates = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    }

    // Count documents to test database
    const userCount = await User.countDocuments()
    const saleCount = await Sale.countDocuments()
    const planCount = await Plan.countDocuments()
    const notificationCount = await Notification.countDocuments()
    const chatRoomCount = await ChatRoom.countDocuments()
    const messageCount = await Message.countDocuments()

    res.json({
      success: true,
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      database: {
        status: dbStates[dbStatus],
        name: mongoose.connection.name,
        collections: {
          users: userCount,
          sales: saleCount,
          plans: planCount,
          notifications: notificationCount,
          chatRooms: chatRoomCount,
          messages: messageCount,
        },
      },
    })
  } catch (error) {
    console.error("Health check error:", error)
    res.status(500).json({
      success: false,
      status: "ERROR",
      error: error.message,
      database: {
        status: "error",
      },
    })
  }
})

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, phone, location } = req.body

    if (!name || !email || !password || !phone || !location) {
      return res.status(400).json({
        success: false,
        error: "All fields are required",
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long",
      })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User already exists with this email",
      })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      location,
      commissionRate: 0.3,
    })

    await user.save()

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1h" },
    )
    
    res.status(201).json({
      success: true,
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        role: user.role,
        commissionRate: user.commissionRate,
      },
    })

    // Enviar notificacion de forma asincrona
    setImmediate(async () => {
      try {
        await enviarMensajeTelegram(`<b>Nuevo registro</b>\nNombre: ${name}\nEmail: ${email}\nTelefono: ${phone}`);
      } catch (e) {
        console.error('Error enviando Telegram:', e.message);
      }
    });

  } catch (error) {
    handleError(res, error, "Registration failed")
  }
})

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid credentials",
      })
    }

    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        error: "Account is deactivated",
      })
    }

    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: "Invalid credentials",
      })
    }

const token = jwt.sign(
  { userId: user._id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || "1h" },
)

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        role: user.role,
        commissionRate: user.commissionRate,
        totalSales: user.totalSales,
        totalCommissions: user.totalCommissions,
      },
    })
  } catch (error) {
    handleError(res, error, "Login failed")
  }
})

// User Routes
app.get("/api/users/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password")
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    res.json({
      success: true,
      user,
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch profile")
  }
})

app.put("/api/users/profile", authenticateToken, async (req, res) => {
  try {
    const { name, phone, location, currentPassword, newPassword } = req.body

    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    // Si se quiere cambiar contraseña
    if (currentPassword && newPassword) {
      const isValidPassword = await bcrypt.compare(currentPassword, user.password)
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          error: "La contraseña actual es incorrecta",
        })
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: "La nueva contraseña debe tener al menos 6 caracteres",
        })
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12)
      user.password = hashedPassword
    }

    // Actualizar otros campos si se proporcionan
    if (name) user.name = name
    if (phone) user.phone = phone
    if (location) user.location = location

    await user.save()

    const updatedUser = await User.findById(req.user.userId).select("-password")

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    })
  } catch (error) {
    handleError(res, error, "Failed to update profile")
  }
})

// Sales Routes
app.post("/api/sales", authenticateToken, async (req, res) => {
  try {
    console.log("Creating sale - User:", req.user.userId)

    const { planId, description, sellerId: assignedSellerId } = req.body
    console.log('REQ BODY:', req.body)

    let customerInfo = req.body.customerInfo


    console.log('PLAN:', req.body.plan);
console.log('DESCRIPTION:', req.body.description);
console.log('CUSTOMER:', req.body.customer);
    if (!planId || !description || !customerInfo) {
      return res.status(400).json({
        success: false,
        error: "Plan, description and customer info are required",
      })
    }

    if (typeof customerInfo === "string") {
      customerInfo = JSON.parse(customerInfo)
    }

    const requiredCustomerFields = ["name", "email", "phone", "dni"]
    const requiredAddressFields = ["street", "number", "city", "province", "postalCode"]

    for (const field of requiredCustomerFields) {
      if (!customerInfo[field]) {
        return res.status(400).json({
          success: false,
          error: `Customer ${field} is required`,
        })
      }
    }

    if (!customerInfo.address) {
      return res.status(400).json({
        success: false,
        error: "Customer address is required",
      })
    }

    for (const field of requiredAddressFields) {
      if (!customerInfo.address[field]) {
        return res.status(400).json({
          success: false,
          error: `Customer address ${field} is required`,
        })
      }
    }

    const plan = await Plan.findById(planId)
    if (!plan || !plan.isActive) {
      return res.status(404).json({
        success: false,
        error: "Plan not found or inactive",
      })
    }

    // Obtener el usuario que crea la venta
    const currentUser = await User.findById(req.user.userId)
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    // Si es admin o supervisor y asigna a otro vendedor
    let targetSeller = currentUser
    console.log("[v0] assignedSellerId from request:", assignedSellerId)
    console.log("[v0] currentUser role:", currentUser.role)
    
    if (assignedSellerId && (currentUser.role === "admin" || currentUser.role === "supervisor" || currentUser.role === "support")) {
      targetSeller = await User.findById(assignedSellerId)
      console.log("[v0] Found targetSeller:", targetSeller ? targetSeller._id : "NOT FOUND")
      if (!targetSeller) {
        return res.status(404).json({
          success: false,
          error: "Assigned seller not found",
        })
      }
    }
    
    console.log("[v0] Final targetSeller._id:", targetSeller._id)
    console.log("[v0] Final targetSeller.name:", targetSeller.name)

    const commission = plan.price * targetSeller.commissionRate

    const statusHistory = [
      {
        status: "pending",
        changedBy: currentUser._id,
        changedAt: new Date(),
        notes: "Venta registrada",
      },
    ]

    const { planDetail, customPrice, paymentInfo } = req.body

    // Si el supervisor crea la venta, guardar su ID para poder seguir viendola
    const supervisorId = currentUser.role === "supervisor" ? currentUser._id : undefined

    const sale = new Sale({
      sellerId: targetSeller._id,
      sellerName: targetSeller.name,
      supervisorId: supervisorId,
      planId: plan._id,
      planName: plan.name,
      planPrice: plan.price,
      commission,
      commissionRate: targetSeller.commissionRate,
      description,
      customerInfo,
      statusHistory,
      planDetail: planDetail || undefined,
      customPrice: customPrice || undefined,
      paymentInfo: paymentInfo || undefined,
    })

    await sale.save()
        // Solo sumar al total si la venta no está cancelada

    console.log("Sale created successfully:", sale._id)

    // Si la venta fue asignada a otro vendedor (no al creador), notificarle
    if (assignedSellerId && currentUser._id.toString() !== targetSeller._id.toString()) {
      const assignmentNotification = new Notification({
        title: "Nueva venta asignada",
        message: `Se te ha asignado una nueva venta del plan ${plan.name} para el cliente ${customerInfo.name}. Revisa tu panel de ventas para mas detalles.`,
        type: "info",
        priority: "high",
        recipients: [targetSeller._id],
        createdBy: currentUser._id,
      });
      await assignmentNotification.save();
    }

    if (sale.status !== "cancelled") {
      await User.findByIdAndUpdate(targetSeller._id, {
        $inc: {
          totalSales: plan.price,
          totalCommissions: commission,
        },
      })
    }

    // Responder inmediatamente con exito
    res.status(201).json({
      success: true,
      message: "Sale created successfully",
      sale,
    })

    // Enviar notificaciones de forma asincrona (no bloquean la respuesta)
    setImmediate(async () => {
      try {
        await enviarMensajeTelegram(
          `Nueva venta:\nMonto: $${plan.price}\nProducto: ${plan.name}\nVendedor: ${targetSeller.name}`
        );
      } catch (e) {
        console.error('Error enviando Telegram:', e.message);
      }

      try {
        await enviarEmailNuevaVenta(sale, targetSeller, plan);
      } catch (e) {
        console.error('Error enviando email:', e.message);
      }
    });

  } catch (error) {
    console.error("Error creating sale:", error)
    if (req.file) {
      fs.unlink(path.join(uploadsDir, req.file.filename), (err) => {
        if (err) console.error("Error deleting file:", err)
      })
    }
    handleError(res, error, "Failed to create sale")
  }
})

app.get("/api/sales", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching sales for user:", req.user.userId, "role:", req.user.role)

    const { page = 1, limit = 100, status, startDate, endDate } = req.query

    // Convertir userId a ObjectId para comparacion correcta
    const userObjectId = new mongoose.Types.ObjectId(req.user.userId)
    
    let query = {}
    
    if (req.user.role === "supervisor") {
      // Supervisor ve: sus propias ventas + ventas donde es supervisorId
      query = {
        $or: [
          { sellerId: userObjectId },
          { supervisorId: userObjectId }
        ]
      }
    } else {
      // Vendedor solo ve sus propias ventas
      query = { sellerId: userObjectId }
    }

    if (status) query.status = status
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    console.log("Sales query:", JSON.stringify(query))

    const sales = await Sale.find(query)
      .populate("planId", "name description")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Sale.countDocuments(query)

    console.log(`Found ${sales.length} sales out of ${total} total`)

    res.json({
      success: true,
      sales,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching sales:", error)
    handleError(res, error, "Failed to fetch sales")
  }
})

// Plans Routes
app.get("/api/plans", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching plans")

    const plans = await Plan.find({ isActive: true }).select("name description price features").sort({ price: 1 })

    console.log(`Found ${plans.length} active plans`)

    res.json({
      success: true,
      plans,
    })
  } catch (error) {
    console.error("Error fetching plans:", error)
    handleError(res, error, "Failed to fetch plans")
  }
})

// Dashboard Routes
app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching dashboard stats for user:", req.user.userId)

    const userId = req.user.userId

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    const salesStats = await Sale.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$planPrice" },
          totalCommissions: { $sum: "$commission" },
          totalCount: { $sum: 1 },
          avgSale: { $avg: "$planPrice" },
        },
      },
    ])

    const monthlyStats = await Sale.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalSales: { $sum: "$planPrice" },
          totalCommissions: { $sum: "$commission" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ])

    const stats = salesStats[0] || {
      totalSales: 0,
      totalCommissions: 0,
      totalCount: 0,
      avgSale: 0,
    }

    console.log("Dashboard stats:", stats)

    res.json({
      success: true,
      user: {
        name: user.name,
        commissionRate: user.commissionRate,
      },
      stats,
      monthlyStats,
    })
  } catch (error) {
    console.error("Error fetching dashboard stats:", error)
    handleError(res, error, "Failed to fetch dashboard stats")
  }
})

// Support Routes - Gestion de ventas sin acceso a comisiones
app.get("/api/support/sales", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, sellerId, startDate, endDate } = req.query
    
    const query = {}
    if (status) query.status = status
    if (sellerId) query.sellerId = sellerId
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    const sales = await Sale.find(query)
      .populate("sellerId", "name email")
      .populate("supervisorId", "name email")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Sale.countDocuments(query)

    res.json({
      success: true,
      sales,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch sales")
  }
})

// Support - Estadisticas basicas (sin datos financieros)
app.get("/api/support/stats", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const totalSales = await Sale.countDocuments()
    const pendingSales = await Sale.countDocuments({ status: "pending" })
    const pendingAppointment = await Sale.countDocuments({ status: "pending_appointment" })
    const appointedSales = await Sale.countDocuments({ status: "appointed" })
    const completedSales = await Sale.countDocuments({ status: "completed" })
    const cancelledSales = await Sale.countDocuments({ status: "cancelled" })
    const totalSellers = await User.countDocuments({ role: "seller", isActive: true })
    const totalSupervisors = await User.countDocuments({ role: "supervisor", isActive: true })

    res.json({
      success: true,
      stats: {
        totalSales,
        pendingSales,
        pendingAppointment,
        appointedSales,
        completedSales,
        cancelledSales,
        totalSellers,
        totalSupervisors,
      },
    })
  } catch (error) {
    handleError(error, res, "Failed to fetch support stats")
  }
})

// Support - Actualizar estado de venta
app.put("/api/support/sales/:id/status", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { status, notes, statusDate, ctoNumber } = req.body
    const { id } = req.params

    if (!status) {
      return res.status(400).json({ success: false, error: "Status is required" })
    }

    const validStatuses = ["pending", "pending_signature", "pending_appointment", "observed", "appointed", "completed", "cancelled"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status value",
        validValues: validStatuses,
      })
    }

    const sale = await Sale.findById(id)
    if (!sale) {
      return res.status(404).json({ success: false, error: "Sale not found" })
    }

    const previousStatus = sale.status
    const effectiveDate = statusDate ? new Date(statusDate) : new Date()

    sale.statusHistory.push({
      status,
      changedBy: req.user.userId,
      changedAt: effectiveDate,
      notes: notes || "",
    })

    sale.status = status
    
    if (status === "appointed") {
      sale.appointedDate = effectiveDate
    } else if (status === "completed") {
      sale.completedDate = effectiveDate
      // Guardar numero de CTO si se proporciona
      if (ctoNumber) {
        sale.ctoNumber = ctoNumber
      }
    }

    await sale.save()

    res.json({
      success: true,
      message: "Sale status updated successfully",
      sale,
    })
  } catch (error) {
    handleError(res, error, "Failed to update sale status")
  }
})

// Support - Obtener vendedores (solo nombres, sin comisiones)
app.get("/api/support/sellers", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const sellers = await User.find({ 
      role: { $in: ["seller", "supervisor"] },
      isActive: true 
    }).select("_id name email role")

    res.json({
      success: true,
      sellers,
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch sellers")
  }
})

// Admin Routes
  app.get("/api/admin/stats", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    console.log("Fetching admin stats")

    const totalStats = await Sale.aggregate([
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$planPrice" },
          totalCommissions: { $sum: "$commission" },
          totalCount: { $sum: 1 },
        },
      },
    ])

    const userCount = await User.countDocuments({ role: "seller" })
    const planCount = await Plan.countDocuments({ isActive: true })

    // Calcular ventas por estado
    const salesByStatusAgg = await Sale.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ])

    const salesByStatus = {}
    salesByStatusAgg.forEach((item) => {
      salesByStatus[item._id] = item.count
    })

    const topSellers = await Sale.aggregate([
      {
        $group: {
          _id: "$sellerId",
          name: { $first: "$sellerName" },
          totalSales: { $sum: 1 },
          totalCommissions: { $sum: "$commission" },
        },
      },
      { $sort: { totalSales: -1 } },
      { $limit: 10 },
    ])

    const topPlans = await Sale.aggregate([
      {
        $group: {
          _id: "$planId",
          planName: { $first: "$planName" },
          totalSales: { $sum: "$planPrice" },
          salesCount: { $sum: 1 },
        },
      },
      { $sort: { salesCount: -1 } },
      { $limit: 10 },
    ])

    const aggregatedStats = totalStats[0] || {
      totalSales: 0,
      totalCommissions: 0,
      totalCount: 0,
    }

    console.log("Admin stats:", { aggregatedStats, userCount, planCount, salesByStatus })

    res.json({
      success: true,
      stats: {
        totalSales: aggregatedStats.totalCount,
        totalRevenue: aggregatedStats.totalSales,
        totalCommissions: aggregatedStats.totalCommissions,
        totalUsers: userCount,
        salesByStatus,
        topSellers,
      },
      planCount,
      topPlans,
    })
  } catch (error) {
    console.error("Error fetching admin stats:", error)
    handleError(res, error, "Failed to fetch admin stats")
  }
})

app.get("/api/admin/sales", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    console.log("Fetching admin sales")

    const { page = 1, limit = 20, status, sellerId, startDate, endDate } = req.query

    const query = {}

    if (status) query.status = status
    if (sellerId) query.sellerId = sellerId
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    console.log("Admin sales query:", query)

    const sales = await Sale.find(query)
      .populate("sellerId", "name email commissionRate")
      .populate("planId", "name description")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Sale.countDocuments(query)

    console.log(`Found ${sales.length} admin sales out of ${total} total`)

    res.json({
      success: true,
      sales,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching admin sales:", error)
    handleError(res, error, "Failed to fetch admin sales")
  }
})


app.put("/api/admin/sales/:id/status", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { status, notes, statusDate, ctoNumber } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({ success: false, error: "Status is required" });
    }

    const validStatuses = ["pending", "pending_signature", "pending_appointment", "observed", "appointed", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status value",
        validValues: validStatuses,
      });
    }

    const sale = await Sale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, error: "Sale not found" });
    }

    const previousStatus = sale.status;
    
    // Determinar la fecha a usar (la enviada o la actual)
    const effectiveDate = statusDate ? new Date(statusDate) : new Date();

    sale.statusHistory.push({
      status,
      changedBy: req.user.userId,
      changedAt: effectiveDate,
      notes: notes || "",
    });

    sale.status = status;
    
    // Guardar fechas especificas segun el estado
    if (status === "appointed") {
      sale.appointedDate = effectiveDate;
    } else if (status === "completed") {
      sale.completedDate = effectiveDate;
      // Guardar numero de CTO si se proporciona
      if (ctoNumber) {
        sale.ctoNumber = ctoNumber;
      }
    }

    // === CANCELAR venta ===
    if (status === "cancelled" && previousStatus !== "cancelled") {
      console.log("Cancelando venta. Plan y comisión a $0.");

      await User.findByIdAndUpdate(sale.sellerId, {
        $inc: {
          totalSales: -sale.planPrice,
          totalCommissions: -sale.commission,
        },
      });

      sale.planPrice = 0;
      sale.commission = 0;
    }

    // === REACTIVAR venta ===
   // === REACTIVAR venta ===
if (previousStatus === "cancelled" && status !== "cancelled") {
  console.log("Reactivando venta. Consultando plan y vendedor...");

  const plan = await Plan.findById(sale.planId);
  const user = await User.findById(sale.sellerId);

  if (!plan || !user) {
    return res.status(500).json({
      success: false,
      error: "Missing plan or user to restore sale values",
    });
  }

  const restoredPlanPrice = plan.price;
  const restoredCommission = restoredPlanPrice * (user.commissionRate || 0.7);

  await User.findByIdAndUpdate(sale.sellerId, {
    $inc: {
      totalSales: restoredPlanPrice,
      totalCommissions: restoredCommission,
    },
  });

  sale.planPrice = restoredPlanPrice;
  sale.commission = restoredCommission;

  console.log(`Venta reactivada con plan "${plan.name}" y comisión del vendedor: ${user.commissionRate}`);
}

    await sale.save();

    // Crear notificacion para el vendedor sobre el cambio de estado
    const statusLabels = {
  pending: "Cargada",
  pending_signature: "Pendiente de Firma",
  pending_appointment: "Pendiente de Turno",
  observed: "Observada",
  appointed: "Turnada",
  completed: "Instalada",
  cancelled: "Cancelada"
  };

    const sellerNotification = new Notification({
      title: "Estado de venta actualizado",
      message: `Tu venta de ${sale.planName} para ${sale.customerInfo.name} cambio a: ${statusLabels[status] || status}${notes ? `. Nota: ${notes}` : ""}`,
      type: "info",
      priority: status === "cancelled" ? "high" : "medium",
      recipients: [sale.sellerId],
      createdBy: req.user.userId,
    });
    await sellerNotification.save();

    // Notificar a todos los admins y supervisores sobre el cambio
    const adminsAndSupervisors = await User.find({ 
      role: { $in: ["admin", "supervisor"] },
      isActive: true,
      _id: { $ne: req.user.userId } // Excluir al que hizo el cambio
    });

    if (adminsAndSupervisors.length > 0) {
      const adminNotification = new Notification({
        title: "Cambio de estado en venta",
        message: `Venta de ${sale.sellerName} (${sale.planName}) cambio de ${statusLabels[previousStatus] || previousStatus} a ${statusLabels[status] || status}`,
        type: "info",
        priority: "low",
        recipients: adminsAndSupervisors.map(u => u._id),
        createdBy: req.user.userId,
      });
      await adminNotification.save();
    }

    // Responder inmediatamente con exito
    res.json({
      success: true,
      message: "Sale status updated successfully",
      sale,
    });

    // Enviar notificaciones de forma asincrona (no bloquean la respuesta)
    setImmediate(async () => {
      try {
        await enviarMensajeTelegram(
          `<b>Estado actualizado</b>\n` +
          `${statusLabels[previousStatus] || previousStatus} -> ${statusLabels[status] || status}\n` +
          `Cliente: ${sale.customerInfo.name}\n` +
          `Plan: ${sale.planName}\n` +
          `Vendedor: ${sale.sellerName}`
        );
      } catch (e) {
        console.error('Error enviando Telegram:', e.message);
      }

      try {
        await enviarEmailCambioEstado(sale, previousStatus, status, notes);
      } catch (e) {
        console.error('Error enviando email:', e.message);
      }
    });

  } catch (error) {
    handleError(res, error, "Failed to update sale status");
  }
});

// Actualizar costos de una venta (instalacion, admin, anuncio, comision vendedor)
app.put("/api/admin/sales/:id/costs", authenticateToken, async (req, res) => {
  try {
    const { installationCost, adminCost, adCost, sellerCommissionPaid } = req.body;
    const { id } = req.params;

    // Solo admin, supervisor y support pueden actualizar costos
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "supervisor" && currentUser.role !== "support")) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to update sale costs",
      });
    }

    const sale = await Sale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, error: "Sale not found" });
    }

  // Actualizar los costos
  // Si se coloca costo de instalacion por primera vez, guardar la fecha
  if (installationCost !== undefined) {
    const newInstallationCost = Number(installationCost);
    if (newInstallationCost > 0 && (!sale.installationCost || sale.installationCost === 0)) {
      sale.installationCostDate = new Date();
    }
    sale.installationCost = newInstallationCost;
  }
  if (adminCost !== undefined) sale.adminCost = Number(adminCost);
  if (adCost !== undefined) sale.adCost = Number(adCost);
  if (sellerCommissionPaid !== undefined) sale.sellerCommissionPaid = Number(sellerCommissionPaid);
  
  await sale.save();

    res.json({
      success: true,
      message: "Sale costs updated successfully",
      sale,
    });
  } catch (error) {
    handleError(res, error, "Failed to update sale costs");
  }
});

// Asignar/reasignar vendedor a una venta
app.put("/api/admin/sales/:id/assign", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { sellerId } = req.body;
    const { id } = req.params;

    if (!sellerId) {
      return res.status(400).json({
        success: false,
        error: "Seller ID is required",
      });
    }

    const sale = await Sale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, error: "Sale not found" });
    }

    const newSeller = await User.findById(sellerId);
    if (!newSeller || !newSeller.isActive) {
      return res.status(404).json({
        success: false,
        error: "Seller not found or inactive",
      });
    }

    const oldSellerId = sale.sellerId;
    const oldSellerName = sale.sellerName;

    // Actualizar el vendedor
    sale.sellerId = newSeller._id;
    sale.sellerName = newSeller.name;

    // Agregar al historial de estados
    sale.statusHistory.push({
      status: sale.status,
      changedBy: req.user.userId,
      changedAt: new Date(),
      notes: `Venta reasignada de ${oldSellerName} a ${newSeller.name}`,
    });

    await sale.save();

    // Si se cambio de vendedor, actualizar contadores
    if (oldSellerId.toString() !== newSeller._id.toString() && sale.status !== "cancelled") {
      // Quitar del vendedor anterior
      await User.findByIdAndUpdate(oldSellerId, {
        $inc: {
          totalSales: -sale.planPrice,
          totalCommissions: -sale.commission,
        },
      });

      // Agregar al nuevo vendedor
      await User.findByIdAndUpdate(newSeller._id, {
        $inc: {
          totalSales: sale.planPrice,
          totalCommissions: sale.commission,
        },
      });

      // Notificar al nuevo vendedor
      const assignmentNotification = new Notification({
        title: "Nueva venta asignada",
        message: `Se te ha asignado una venta del plan ${sale.planName} para el cliente ${sale.customerInfo.name}.`,
        type: "info",
        priority: "high",
        recipients: [newSeller._id],
        createdBy: req.user.userId,
      });
      await assignmentNotification.save();
    }

    res.json({
      success: true,
      message: "Sale assigned successfully",
      sale,
    });
  } catch (error) {
    handleError(res, error, "Failed to assign sale");
  }
});

// Supervisor puede asignar ventas propias a vendedores
app.put("/api/sales/:id/assign", authenticateToken, async (req, res) => {
  try {
    const { sellerId } = req.body;
    const { id } = req.params;
    const userId = req.user.userId;

    // Solo admins y supervisores pueden asignar
    if (req.user.role !== "admin" && req.user.role !== "supervisor") {
      return res.status(403).json({
        success: false,
        error: "No tienes permisos para asignar ventas",
      });
    }

    if (!sellerId) {
      return res.status(400).json({
        success: false,
        error: "Seller ID is required",
      });
    }

    const sale = await Sale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, error: "Sale not found" });
    }

    // Si es supervisor, solo puede asignar sus propias ventas
    if (req.user.role === "supervisor" && sale.sellerId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: "Solo puedes asignar tus propias ventas",
      });
    }

    const newSeller = await User.findById(sellerId);
    if (!newSeller || !newSeller.isActive) {
      return res.status(404).json({
        success: false,
        error: "Seller not found or inactive",
      });
    }

    // Solo puede asignar a vendedores
    if (newSeller.role !== "seller") {
      return res.status(400).json({
        success: false,
        error: "Solo puedes asignar a vendedores",
      });
    }

    const oldSellerId = sale.sellerId;
    const oldSellerName = sale.sellerName;

    // Actualizar el vendedor (mantiene el supervisor como creador original)
    sale.sellerId = newSeller._id;
    sale.sellerName = newSeller.name;
    
    // Guardar quien es el supervisor que creo la venta (si no existe ya)
    if (!sale.supervisorId && req.user.role === "supervisor") {
      sale.supervisorId = userId;
    }

    // Agregar al historial de estados
    sale.statusHistory.push({
      status: sale.status,
      changedBy: userId,
      changedAt: new Date(),
      notes: `Venta asignada de ${oldSellerName} a ${newSeller.name}`,
    });

    await sale.save();

    // Si se cambio de vendedor, actualizar contadores
    if (oldSellerId.toString() !== newSeller._id.toString() && sale.status !== "cancelled") {
      // Quitar del vendedor anterior (si no es el supervisor)
      const oldSeller = await User.findById(oldSellerId);
      if (oldSeller && oldSeller.role === "seller") {
        await User.findByIdAndUpdate(oldSellerId, {
          $inc: {
            totalSales: -sale.planPrice,
            totalCommissions: -sale.commission,
          },
        });
      }

      // Agregar al nuevo vendedor
      await User.findByIdAndUpdate(newSeller._id, {
        $inc: {
          totalSales: sale.planPrice,
          totalCommissions: sale.commission,
        },
      });

      // Notificar al nuevo vendedor
      const assignmentNotification = new Notification({
        title: "Nueva venta asignada",
        message: `Se te ha asignado una venta del plan ${sale.planName} para el cliente ${sale.customerInfo.name}.`,
        type: "info",
        priority: "high",
        recipients: [newSeller._id],
        createdBy: userId,
      });
      await assignmentNotification.save();
    }

    res.json({
      success: true,
      message: "Sale assigned successfully",
      sale,
    });
  } catch (error) {
    handleError(error, res, "Failed to assign sale");
  }
});

// Endpoint para supervisores y admins: obtener lista de vendedores activos
app.get("/api/sellers", authenticateToken, async (req, res) => {
  try {
    // Solo admins y supervisores pueden ver la lista de vendedores
    if (req.user.role !== "admin" && req.user.role !== "supervisor") {
      return res.status(403).json({
        success: false,
        error: "No tienes permisos para ver la lista de vendedores",
      });
    }

    const sellers = await User.find({ 
      role: "seller", 
      isActive: true 
    }).select("-password");

    res.json({
      success: true,
      sellers,
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch sellers");
  }
});

app.get("/api/admin/plans", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    console.log("Fetching admin plans")

    const { page = 1, limit = 20 } = req.query

    const plans = await Plan.find({})
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Plan.countDocuments({})

    console.log(`Found ${plans.length} admin plans out of ${total} total`)

    res.json({
      success: true,
      plans,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching admin plans:", error)
    handleError(res, error, "Failed to fetch admin plans")
  }
})

app.post("/api/admin/plans", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, features } = req.body

    if (!name || !description || !price) {
      return res.status(400).json({
        success: false,
        error: "Name, description and price are required",
      })
    }

    const plan = new Plan({
      name,
      description,
      price: Number(price),
      features: features || [],
      createdBy: req.user.userId,
    })

    await plan.save()

    res.status(201).json({
      success: true,
      message: "Plan created successfully",
      plan,
    })
  } catch (error) {
    handleError(res, error, "Failed to create plan")
  }
})

app.put("/api/admin/plans/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, features, isActive } = req.body

    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      { name, description, price: Number(price), features, isActive },
      { new: true, runValidators: true },
    )

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: "Plan not found",
      })
    }

    res.json({
      success: true,
      message: "Plan updated successfully",
      plan,
    })
  } catch (error) {
    handleError(res, error, "Failed to update plan")
  }
})

app.delete("/api/admin/plans/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id)

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: "Plan not found",
      })
    }

    res.json({
      success: true,
      message: "Plan deleted successfully",
    })
  } catch (error) {
    handleError(res, error, "Failed to delete plan")
  }
})

app.get("/api/admin/users", authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    console.log("Fetching admin users")

    const { page = 1, limit = 20, isActive } = req.query

    const usersQuery = {}
    if (isActive !== undefined) {
      usersQuery.isActive = isActive === "true"
    }

    const users = await User.find(usersQuery)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const totalUsers = await User.countDocuments(usersQuery)

    console.log(`Found ${users.length} users out of ${totalUsers} total`)

    res.json({
      success: true,
      users,
      pagination: {
        totalPages: Math.ceil(totalUsers / limit),
        currentPage: Number(page),
        total: totalUsers,
        hasNext: page * limit < totalUsers,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch admin users")
  }
})

// Create user (Admin only)
app.post("/api/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, phone, location, role } = req.body

    if (!name || !email || !password || !phone || !location) {
      return res.status(400).json({
        success: false,
        error: "All fields are required",
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long",
      })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User already exists with this email",
      })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      location,
      role: role || "seller",
      commissionRate: 0.3,
    })

    await user.save()

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        role: user.role,
        commissionRate: user.commissionRate,
        isActive: user.isActive,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to create user")
  }
})

app.put("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, location, role, commissionRate, isActive, password } = req.body

    const updateData = {
      name,
      phone,
      location,
      isActive,
    }

    if (email) updateData.email = email
    if (role) updateData.role = role
    if (commissionRate !== undefined) updateData.commissionRate = Number(commissionRate)

    // Hash password if provided
    if (password && password.length >= 6) {
      updateData.password = await bcrypt.hash(password, 12)
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true },
    ).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    res.json({
      success: true,
      message: "User updated successfully",
      user,
    })
  } catch (error) {
    handleError(res, error, "Failed to update user")
  }
})

app.delete("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    res.json({
      success: true,
      message: "User deleted successfully",
    })
  } catch (error) {
    handleError(res, error, "Failed to delete user")
  }
})

// Notification Routes
app.get("/api/notifications", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, priority, unreadOnly } = req.query
    const userId = req.user.userId

    const query = {
      $or: [
        { recipients: userId },
        { recipients: { $size: 0 } }, // Global notifications
      ],
      isActive: true,
    }

    if (type) query.type = type
    if (priority) query.priority = priority
    if (unreadOnly === "true") {
      query["readBy.userId"] = { $ne: userId }
    }

    const notifications = await Notification.find(query)
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Notification.countDocuments(query)
    const unreadCount = await Notification.countDocuments({
      ...query,
      "readBy.userId": { $ne: userId },
    })

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch notifications")
  }
})

app.post("/api/notifications", authenticateToken, requireAdmin, upload.array("attachments", 5), async (req, res) => {
  try {
const { title, message, type, priority, recipients, meetingInfo } = req.body;
const { recipientType } = req.body;
    // Parsear attachments si vienen en string (por si acaso)
    if (typeof req.body.attachments === 'string') {
      try {
        req.body.attachments = JSON.parse(req.body.attachments);
      } catch (error) {
        return res.status(400).json({ success: false, error: 'attachments inválidos' });
      }
    }

    if (!title || !message) {
      return res.status(400).json({ success: false, error: "Title and message are required" });
    }


let parsedRecipients = recipients ? (typeof recipients === "string" ? JSON.parse(recipients) : recipients) : [];



if (recipientType === "all") {
  const allVendedores = await User.find({     isActive: true,
    role: { $in: ["seller", "admin"] },
  }).select("_id");
  parsedRecipients = allVendedores.map(u => u._id.toString());
}

let parsedMeetingInfo = meetingInfo ? (typeof meetingInfo === "string" ? JSON.parse(meetingInfo) : meetingInfo) : null;

    // Aquí viene la modificación importante: subir los archivos a Firebase
    const attachments = await Promise.all(
      (req.files || []).map(async (file) => {
        const fileName = `attachments/${Date.now()}_${file.originalname}`;
        const fileUpload = bucket.file(fileName);

        // Subir archivo buffer a Firebase Storage
        await fileUpload.save(file.buffer, {
          metadata: {
            contentType: file.mimetype,
          },
        });

        // Obtener URL firmada (válida por 1 hora)
    // Hacer el archivo público (acceso libre)
    await fileUpload.makePublic();

    // Construir URL pública fija
    const publicUrl = `https://storage.googleapis.com/probandocositas-8c425.appspot.com/${fileName}`;

    return {
      originalName: file.originalname,
      url: publicUrl,  // URL fija y pública
      size: file.size,
      type: file.mimetype,
    };
  })
);

    const notification = new Notification({
      title,
      message,
      type: type || "info",
      priority: priority || "medium",
      recipients: parsedRecipients,
      createdBy: req.user.userId,
      attachments,
      meetingInfo: parsedMeetingInfo,
    });

    await notification.save();

    const transporter = nodemailer.createTransport({
  service: 'gmail', // o tu proveedor SMTP
  auth: {
    user: process.env.EMAIL_SMTP,
    pass: process.env.PASSWORD_SMTP // Gmail requiere contraseña de aplicación
  }
});


        // Buscar emails de usuarios destinatarios
    const usuarios = await User.find({ _id: { $in: parsedRecipients } }).select("email name");

console.log("Usuarios destinatarios:", usuarios.map(u => u.email));


for (const user of usuarios) {
  try {
    console.log(`Enviando correo a: ${user.email}`);
    await transporter.sendMail({
      from: '"TusVentas" <tucorreo@gmail.com>',
      to: user.email,
      subject: `🔔 Nueva notificación de el equipo de TusVentas: ${title}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5;">
          <img src="cid:logoTusVentas" style="max-width: 700px; margin-bottom: 20px;" alt="TusVentas" />
          <h2>Hola ${user.name} tenes una notificacion pendiente de:📌 ${title}</h2>
          <p><strong>Tipo:</strong> ${type}</p>
          <p>${message}</p>
          <p><a href="https://tusventas.netlify.app" style="display:inline-block; padding:10px 15px; background-color:#0b6efd; color:white; text-decoration:none; border-radius:5px;">Ver en la plataforma</a></p>
          <hr />
          <small>Este mensaje fue enviado automáticamente por el sistema TusVentas.</small>
        </div>
      `,
      attachments: [
        {
          filename: 'bannertusventas.png',
          path: './bannertusventas.png', // o desde Firebase si lo descargás
          cid: 'logoTusVentas' // este ID es el que usás en src="cid:logoTusVentas"
        }
      ]
    });
  } catch (err) {
    console.error(`Error enviando correo a ${user.email}:`, err.message);
  }
}

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
      notification,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message || "Failed to create notification" });
  }
});

app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id)
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      })
    }

    const alreadyRead = notification.readBy.some((read) => read.userId.toString() === req.user.userId.toString())

    if (!alreadyRead) {
      notification.readBy.push({
        userId: req.user.userId,
        readAt: new Date(),
      })
      await notification.save()
    }

    res.json({
      success: true,
      message: "Notification marked as read",
    })
  } catch (error) {
    handleError(res, error, "Failed to mark notification as read")
  }
})

app.get("/api/notifications/unread-count", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    const query = {
      $or: [
        { recipients: userId },
        { recipients: { $size: 0 } }, // Global notifications
      ],
      isActive: true,
      "readBy.userId": { $ne: userId }, // Solo no leídas
    }

    const count = await Notification.countDocuments(query)

    res.json({
      success: true,
      count,
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch unread notifications count")
  }
})

// Chat Routes
app.get("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    const rooms = await ChatRoom.find({
      participants: userId,
      isActive: true,
    })
      .populate("participants", "name role")
      .populate("lastMessage")
      .populate("createdBy", "name role")
      .sort({ lastActivity: -1 })

    res.json({
      success: true,
      rooms,
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch chat rooms")
  }
})

app.post("/api/chat/rooms", authenticateToken, async (req, res) => {
  try {
    const { name, type, participants } = req.body
    const userId = req.user.userId

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: "Name and type are required",
      })
    }

    let roomParticipants = [userId]
    if (participants && Array.isArray(participants)) {
      roomParticipants = [...new Set([...roomParticipants, ...participants])]
    }

    const chatRoom = new ChatRoom({
      name,
      type,
      participants: roomParticipants,
      createdBy: userId,
    })

    await chatRoom.save()

    const populatedRoom = await ChatRoom.findById(chatRoom._id)
      .populate("participants", "name role")
      .populate("createdBy", "name role")

    res.status(201).json({
      success: true,
      message: "Chat room created successfully",
      room: populatedRoom,
    })
  } catch (error) {
    handleError(res, error, "Failed to create chat room")
  }
})

app.get("/api/chat/rooms/:roomId/messages", authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params
    const { page = 1, limit = 50 } = req.query
    const userId = req.user.userId

    // Verify user is participant
    const room = await ChatRoom.findById(roomId)
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this chat room",
      })
    }

    const messages = await Message.find({ chatRoom: roomId })
      .populate("sender", "name role")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Message.countDocuments({ chatRoom: roomId })

    res.json({
      success: true,
      messages: messages.reverse(),
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch messages")
  }
})

app.post("/api/chat/rooms/:roomId/messages", authenticateToken, upload.array("attachments", 3), async (req, res) => {
  try {
    const { roomId } = req.params
    const { content, type } = req.body
    const userId = req.user.userId

    if (!content && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        error: "Message content or attachments are required",
      })
    }

    // Verify user is participant
    const room = await ChatRoom.findById(roomId)
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this chat room",
      })
    }

    const attachments =
      req.files?.map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
      })) || []

    const message = new Message({
      chatRoom: roomId,
      sender: userId,
      content: content || "",
      type: type || "text",
      attachments,
    })

    await message.save()

    // Update room last activity and last message
    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: message._id,
      lastActivity: new Date(),
    })

    const populatedMessage = await Message.findById(message._id).populate("sender", "name role")

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
    })
  } catch (error) {
    handleError(res, error, "Failed to send message")
  }
})

app.get('/api/notifications/attachment/:notificationId/:filename', authenticateToken, async (req, res) => {
  try {
    const { notificationId, filename } = req.params;
    const notification = await Notification.findById(notificationId);
    if (!notification) return res.status(404).json({ error: "Notificación no encontrada" });

    // Buscar attachment que coincida con filename
    const attachment = notification.attachments.find(a => {
      try {
        const urlObj = new URL(a.url);
        const pathname = urlObj.pathname;
        const pathParts = pathname.split('/');
        const fileNameFromUrl = pathParts[pathParts.length - 1];
        return fileNameFromUrl === filename;
      } catch {
        return false;
      }
    });

    if (!attachment) return res.status(404).json({ error: "Attachment no encontrado" });

    // Redirigir directo a la URL pública fija
    res.redirect(attachment.url);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});



app.get("/api/chat/private/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId
    const targetUserId = req.params.userId

    if (currentUserId === targetUserId) {
      return res.status(400).json({
        success: false,
        error: "Cannot create private chat with yourself",
      })
    }

    // Check if private room already exists
    let room = await ChatRoom.findOne({
      type: "private",
      participants: { $all: [currentUserId, targetUserId], $size: 2 },
    })
      .populate("participants", "name role")
      .populate("lastMessage")

    if (!room) {
      // Create new private room
      const targetUser = await User.findById(targetUserId)
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: "Target user not found",
        })
      }

      room = new ChatRoom({
        name: `Private chat`,
        type: "private",
        participants: [currentUserId, targetUserId],
        createdBy: currentUserId,
      })

      await room.save()

      room = await ChatRoom.findById(room._id).populate("participants", "name role").populate("lastMessage")
    }

    res.json({
      success: true,
      room,
    })
  } catch (error) {
    handleError(res, error, "Failed to get or create private chat")
  }
})

// Specific Chat Routes for Frontend Compatibility
app.get("/api/chat/group", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    // Find or create group chat room
    let groupRoom = await ChatRoom.findOne({
      type: "group",
      name: "Equipo de Ventas",
    }).populate("participants", "name role")

    if (!groupRoom) {
      // Create group chat room with all users
      const allUsers = await User.find({ isActive: true }).select("_id")
      const participantIds = allUsers.map((user) => user._id)

      groupRoom = new ChatRoom({
        name: "Equipo de Ventas",
        type: "group",
        participants: participantIds,
        createdBy: userId,
      })

      await groupRoom.save()

      groupRoom = await ChatRoom.findById(groupRoom._id).populate("participants", "name role")
    } else {
      // Add user to group if not already a participant
      if (!groupRoom.participants.some((p) => p._id.toString() === userId.toString())) {
        groupRoom.participants.push(userId)
        await groupRoom.save()
        groupRoom = await ChatRoom.findById(groupRoom._id).populate("participants", "name role")
      }
    }

    res.json({
      success: true,
      chatRoom: groupRoom,
    })
  } catch (error) {
    handleError(res, error, "Failed to get group chat")
  }
})

app.get("/api/chat/private-admin", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId

    if (req.user.role === "admin") {
      return res.status(400).json({
        success: false,
        error: "Admins should use private-chats endpoint",
      })
    }

    // Find admin user
    const admin = await User.findOne({ role: "admin" })
    if (!admin) {
      return res.status(404).json({
        success: false,
        error: "No admin found",
      })
    }

    // Find or create private chat with admin
    let privateRoom = await ChatRoom.findOne({
      type: "private",
      participants: { $all: [userId, admin._id], $size: 2 },
    }).populate("participants", "name role")

    if (!privateRoom) {
      privateRoom = new ChatRoom({
        name: "Chat con Admin",
        type: "private",
        participants: [userId, admin._id],
        createdBy: userId,
      })

      await privateRoom.save()
      privateRoom = await ChatRoom.findById(privateRoom._id).populate("participants", "name role")
    }

    res.json({
      success: true,
      chatRoom: privateRoom,
    })
  } catch (error) {
    handleError(res, error, "Failed to get private chat with admin")
  }
})

app.get("/api/chat/private-chats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.userId

    // Get all private chats where admin is a participant
    const privateChats = await ChatRoom.find({
      type: "private",
      participants: adminId,
    })
      .populate("participants", "name role email")
      .populate("lastMessage")
      .sort({ lastActivity: -1 })

    res.json({
      success: true,
      chatRooms: privateChats,
    })
  } catch (error) {
    handleError(res, error, "Failed to get private chats")
  }
})

// Update existing message routes to match frontend expectations
app.get("/api/chat/:chatRoomId/messages", authenticateToken, async (req, res) => {
  try {
    const { chatRoomId } = req.params
    const { page = 1, limit = 50 } = req.query
    const userId = req.user.userId

    // Verify user is participant
    const room = await ChatRoom.findById(chatRoomId)
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this chat room",
      })
    }

    const messages = await Message.find({ chatRoom: chatRoomId })
      .populate("sender", "name role")
      .sort({ createdAt: 1 }) // Ascending order for chat
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    const total = await Message.countDocuments({ chatRoom: chatRoomId })

    res.json({
      success: true,
      messages,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    handleError(res, error, "Failed to fetch messages")
  }
})

app.post("/api/chat/:chatRoomId/messages", authenticateToken, async (req, res) => {
  try {
    const { chatRoomId } = req.params
    const { content } = req.body
    const userId = req.user.userId

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message content is required",
      })
    }

    // Verify user is participant
    const room = await ChatRoom.findById(chatRoomId)
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        error: "Access denied to this chat room",
      })
    }

    const message = new Message({
      chatRoom: chatRoomId,
      sender: userId,
      content: content.trim(),
      type: "text",
    })

    await message.save()

    // Update room last activity and last message
    await ChatRoom.findByIdAndUpdate(chatRoomId, {
      lastMessage: message._id,
      lastActivity: new Date(),
    })

    const populatedMessage = await Message.findById(message._id).populate("sender", "name role")

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
    })
  } catch (error) {
    handleError(res, error, "Failed to send message")
  }
})

app.put("/api/chat/:chatRoomId/read", authenticateToken, async (req, res) => {
  try {
    const { chatRoomId } = req.params
    const userId = req.user.userId

    // Mark all messages in this chat as read by this user
    await Message.updateMany(
      {
        chatRoom: chatRoomId,
        "readBy.userId": { $ne: userId },
      },
      {
        $push: {
          readBy: {
            userId: userId,
            readAt: new Date(),
          },
        },
      },
    )

    res.json({
      success: true,
      message: "Messages marked as read",
    })
  } catch (error) {
    handleError(res, error, "Failed to mark messages as read")
  }
})

// ==================== SUPERVISOR AD COSTS ENDPOINTS ====================

// Obtener todos los costos de anuncio (solo admin)
app.get("/api/admin/ad-costs", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Solo los administradores pueden ver todos los costos de anuncio",
      });
    }

    const { month, supervisorId } = req.query;
    const filter = {};
    
    if (month) filter.month = month;
    if (supervisorId) filter.supervisorId = supervisorId;

    const adCosts = await SupervisorAdCost.find(filter)
      .populate("supervisorId", "name email")
      .populate("createdBy", "name")
      .populate("updatedBy", "name")
      .sort({ month: -1, createdAt: -1 });

    res.json({
      success: true,
      adCosts,
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch ad costs");
  }
});

// Crear o actualizar costo de anuncio (solo admin)
app.post("/api/admin/ad-costs", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Solo los administradores pueden crear costos de anuncio",
      });
    }

    const { supervisorId, amount, month, notes } = req.body;

    if (!supervisorId || amount === undefined || !month) {
      return res.status(400).json({
        success: false,
        error: "Se requiere supervisorId, amount y month",
      });
    }

    // Verificar que el supervisor existe y es supervisor
    const supervisor = await User.findById(supervisorId);
    if (!supervisor || supervisor.role !== "supervisor") {
      return res.status(404).json({
        success: false,
        error: "Supervisor no encontrado o no es un supervisor",
      });
    }

    // Buscar si ya existe un registro para este supervisor/mes
    let adCost = await SupervisorAdCost.findOne({ supervisorId, month });

    if (adCost) {
      // Actualizar existente
      adCost.amount = amount;
      adCost.notes = notes || adCost.notes;
      adCost.updatedBy = req.user.userId;
      await adCost.save();
    } else {
      // Crear nuevo
      adCost = new SupervisorAdCost({
        supervisorId,
        amount,
        month,
        notes,
        createdBy: req.user.userId,
        updatedBy: req.user.userId,
      });
      await adCost.save();
    }

    // Obtener datos populados
    const populatedAdCost = await SupervisorAdCost.findById(adCost._id)
      .populate("supervisorId", "name email")
      .populate("createdBy", "name")
      .populate("updatedBy", "name");

    res.json({
      success: true,
      message: adCost.isNew ? "Costo de anuncio creado" : "Costo de anuncio actualizado",
      adCost: populatedAdCost,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Ya existe un costo de anuncio para este supervisor y mes",
      });
    }
    handleError(res, error, "Failed to create/update ad cost");
  }
});

// Eliminar costo de anuncio (solo admin)
app.delete("/api/admin/ad-costs/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Solo los administradores pueden eliminar costos de anuncio",
      });
    }

    const { id } = req.params;
    const adCost = await SupervisorAdCost.findByIdAndDelete(id);

    if (!adCost) {
      return res.status(404).json({
        success: false,
        error: "Costo de anuncio no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Costo de anuncio eliminado",
    });
  } catch (error) {
    handleError(res, error, "Failed to delete ad cost");
  }
});

// Obtener costos de anuncio de un supervisor (para el propio supervisor)
app.get("/api/ad-costs/my", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "supervisor") {
      return res.status(403).json({
        success: false,
        error: "Solo los supervisores pueden ver sus costos de anuncio",
      });
    }

    const { month } = req.query;
    const filter = { supervisorId: req.user.userId };
    if (month) filter.month = month;

    const adCosts = await SupervisorAdCost.find(filter)
      .sort({ month: -1 });

    res.json({
      success: true,
      adCosts,
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch my ad costs");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
