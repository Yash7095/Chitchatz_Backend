import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    // console.log("hiii from db.js");
    const connect = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`database connected: ${connect.connection.host}`);
  } catch (err) {
    console.log("Mongodb connection error", err);
  }
};
