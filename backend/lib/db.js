// lib/db.js
const mongoose = require("mongoose");

let cached = global.__mongoose;
if (!cached) cached = global.__mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("Missing MONGO_URI");

    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,            // important: don't buffer forever
      serverSelectionTimeoutMS: 10000,  // fail fast if cannot reach Atlas
      connectTimeoutMS: 10000,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;