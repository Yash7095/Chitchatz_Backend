import cloudinary from "../lib/cloudinary.js";
import Status from "../models/status.model.js";
import User from "../models/user.model.js";
import { io } from "../lib/socket.js";

export const createStatus = async (req, res) => {
  try {
    const { media, mediaType, caption } = req.body;
    const userId = req.user._id;

    if (!media || !mediaType) {
      return res.status(400).json({ message: "Media is required" });
    }

    const uploadResponse = await cloudinary.uploader.upload(media, {
      resource_type: mediaType === "video" ? "video" : "image",
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const status = new Status({
      userId,
      mediaUrl: uploadResponse.secure_url,
      mediaType,
      caption: caption || "",
      expiresAt,
    });

    await status.save();
    const populated = await Status.findById(status._id).populate(
      "userId",
      "fullName profilePic username"
    );

    // Notify all connected clients so StatusBar updates without refresh
    io.emit("newStatus", { userId: userId.toString() });

    res.status(201).json(populated);
  } catch (error) {
    console.log("Error in createStatus:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getStatuses = async (req, res) => {
  try {
    const myId = req.user._id;
    const now = new Date();

    // Get statuses from all users (including own) that haven't expired
    const statuses = await Status.find({ expiresAt: { $gt: now } })
      .populate("userId", "fullName profilePic username")
      .sort({ createdAt: -1 });

    // Group by userId
    const grouped = {};
    statuses.forEach((s) => {
      if (!s.userId) return; // skip if user was deleted
      const uid = s.userId._id.toString();
      if (!grouped[uid]) {
        grouped[uid] = {
          user: s.userId,
          statuses: [],
          hasUnseen: false,
        };
      }
      grouped[uid].statuses.push(s);
      if (!s.viewers.map((v) => v.toString()).includes(myId.toString())) {
        grouped[uid].hasUnseen = true;
      }
    });

    res.status(200).json(Object.values(grouped));
  } catch (error) {
    console.log("Error in getStatuses:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const viewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    await Status.findByIdAndUpdate(id, {
      $addToSet: { viewers: userId },
    });

    res.status(200).json({ message: "Viewed" });
  } catch (error) {
    console.log("Error in viewStatus:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const status = await Status.findOne({ _id: id, userId });
    if (!status) return res.status(404).json({ message: "Status not found" });

    await status.deleteOne();
    res.status(200).json({ message: "Status deleted" });
  } catch (error) {
    console.log("Error in deleteStatus:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
