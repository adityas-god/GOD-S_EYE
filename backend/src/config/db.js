import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/insight_hub';

  if (isConnected) {
    return mongoose.connection;
  }

  try {
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${conn.connection.name} @ ${conn.connection.host}`);
    return conn.connection;
  } catch (error) {
    console.warn(`[MongoDB] Connection warning (${error.message}). Running in resilient fallback mode (in-memory caching enabled).`);
    isConnected = false;
    return null;
  }
}

export function isDbConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}
