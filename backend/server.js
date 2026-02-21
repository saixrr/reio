require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// ── Route Imports ─────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const sessionRoutes = require("./routes/session");
const progressRoutes = require("./routes/progress");
const nutritionRoutes = require("./routes/nutrition");
const motivationRoutes = require("./routes/motivation");

const app = express();

// ── CORS (DEV + PROD) ─────────────────────────────────────────
// Put your allowed origins in env for deployment.
// Example (Vercel env):
// CORS_ORIGINS=https://your-frontend.vercel.app,https://www.yourdomain.com,http://localhost:5173
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Optionally allow all Vercel preview URLs for your project:
// e.g. https://xxx-git-branch-yourteam.vercel.app
const allowVercelPreview =
  process.env.ALLOW_VERCEL_PREVIEW === "true"
    ? /^https:\/\/.*\.vercel\.app$/
    : null;

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no Origin (curl, server-to-server)
    if (!origin) return cb(null, true);

    // Allow explicit origins
    if (allowedOrigins.includes(origin)) return cb(null, true);

    // Allow vercel previews if enabled
    if (allowVercelPreview && allowVercelPreview.test(origin)) return cb(null, true);

    // Reject
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

// ✅ Apply CORS BEFORE body parsers and routes
app.use(cors(corsOptions));
// ✅ Ensure preflight (OPTIONS) always gets handled
app.options("*", cors(corsOptions));

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Diagnostic middleware
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  if (req.method === "POST") {
    console.log("📦 Body:", JSON.stringify(req.body, null, 2));
  }
  next();
});

// ── Health Check ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Adaptive Fitness API 🏋️",
    documentation: "/api/health",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Adaptive Fitness API is running 🏋️",
    timestamp: new Date(),
  });
});

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/nutrition", nutritionRoutes);
app.use("/api/motivation", motivationRoutes);

// ── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found.`,
  });
});

// ── Global Error Handler ──────────────────────────────────────
// IMPORTANT: When CORS blocks, the browser will show a CORS error.
// This handler makes server logs clearer.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  // If it's a CORS error, return a cleaner response
  if (String(err.message || "").startsWith("CORS blocked")) {
    return res.status(403).json({ success: false, message: err.message });
  }

  res.status(500).json({ success: false, message: "Internal server error." });
});

// ── MongoDB Connection + Server Start ─────────────────────────
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/adaptive_fitness";

const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.warn("⚠️ Local MongoDB connection failed, attempting to start in-memory database...");
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log("✅ In-memory MongoDB started and connected");
    } catch (memErr) {
      console.error("❌ Failed to start in-memory MongoDB:", memErr.message);
      process.exit(1);
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 API Base: http://localhost:${PORT}/api`);
    console.log(`🔐 Allowed origins:`, allowedOrigins);
    if (allowVercelPreview) console.log(`🔐 Vercel preview origins allowed`);
  });
};

startServer();

module.exports = app;