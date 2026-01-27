import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/user.model.js"; // 👈 correct path

const MONGODB_URI =
  "mongodb+srv://7095yash:yash2302@cluster0.cz0kpat.mongodb.net/chitchatz";

const resetPassword = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected");

    const hashed = await bcrypt.hash("newpassword123", 10);

    const result = await User.updateOne(
      { email: "yash123@gmail.com" },
      { $set: { password: hashed } },
    );

    console.log("Password reset done:", result);
    process.exit(0);
  } catch (err) {
    console.error("Reset failed:", err);
    process.exit(1);
  }
};

resetPassword();
