import cloudinary from "../lib/cloudinary.js";
import { generateToken } from "../lib/utils.js";
import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendOTPEmail } from "../lib/mailer.js";

const formatUserResponse = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  profilePic: user.profilePic,
  username: user.username,
  bio: user.bio,
  phone: user.phone,
  statusText: user.statusText,
  mood: user.mood,
  lastSeen: user.lastSeen,
  isOnline: user.isOnline,
  role: user.role,
  createdAt: user.createdAt,
});

export const signup = async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    if (!fullName || !email || !password)
      return res.status(400).json({ message: "All fields are required" });
    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // First user on a fresh DB automatically becomes admin
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? "admin" : "user";

    const newUser = new User({ fullName, email, password: hashedPassword, role });

    if (newUser) {
      generateToken(newUser._id, res);
      await newUser.save();
      res.status(201).json(formatUserResponse(newUser));
    } else {
      res.status(400).json({ message: "Invalid user details" });
    }
  } catch (error) {
    console.log("Error in signup:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid Credentials" });

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) return res.status(400).json({ message: "Invalid Credentials" });

    generateToken(user._id, res);
    res.status(200).json(formatUserResponse(user));
  } catch (error) {
    console.log("Error in login:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const logout = (req, res) => {
  try {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { profilePic, fullName, username, bio, phone, statusText, mood } = req.body;
    const userId = req.user._id;

    const updateData = {};

    if (profilePic) {
      const uploadResponse = await cloudinary.uploader.upload(profilePic);
      updateData.profilePic = uploadResponse.secure_url;
    }
    if (fullName !== undefined) updateData.fullName = fullName;
    if (username !== undefined) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;
    if (phone !== undefined) updateData.phone = phone;
    if (statusText !== undefined) updateData.statusText = statusText;
    if (mood !== undefined) updateData.mood = mood;

    if (Object.keys(updateData).length === 0)
      return res.status(400).json({ message: "No update data provided" });

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
    res.status(200).json(formatUserResponse(updatedUser));
  } catch (error) {
    console.log("Error in updateProfile:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const checkAuth = async (req, res) => {
  try {
    res.status(200).json(formatUserResponse(req.user));
  } catch (error) {
    console.log("Error in checkAuth:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      "-password -resetPasswordOTP -resetPasswordOTPExpiry"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(formatUserResponse(user));
  } catch (error) {
    console.log("Error in getUserProfile:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No account found with this email" });

    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOTP = await bcrypt.hash(otp, 10);

    user.resetPasswordOTP = hashedOTP;
    user.resetPasswordOTPExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    await sendOTPEmail(user.email, otp, user.fullName);

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (error) {
    console.log("Error in forgotPassword:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required" });

    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordOTP)
      return res.status(400).json({ message: "Invalid or expired OTP" });

    if (user.resetPasswordOTPExpiry < new Date())
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });

    const isOTPValid = await bcrypt.compare(otp, user.resetPasswordOTP);
    if (!isOTPValid) return res.status(400).json({ message: "Invalid OTP" });

    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.log("Error in verifyOTP:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "All fields are required" });

    if (newPassword.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordOTP)
      return res.status(400).json({ message: "Invalid or expired OTP" });

    if (user.resetPasswordOTPExpiry < new Date())
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });

    const isOTPValid = await bcrypt.compare(otp, user.resetPasswordOTP);
    if (!isOTPValid) return res.status(400).json({ message: "Invalid OTP" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordOTP = undefined;
    user.resetPasswordOTPExpiry = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successfully. You can now log in." });
  } catch (error) {
    console.log("Error in resetPassword:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
