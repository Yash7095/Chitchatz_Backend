import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";

export const getStats = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7days = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, totalMessages, activeUsers, totalGroups, newUsersToday, messagesToday] =
      await Promise.all([
        User.countDocuments(),
        Message.countDocuments({ isDeleted: false }),
        User.countDocuments({ lastSeen: { $gte: last24h } }),
        Group.countDocuments(),
        User.countDocuments({ createdAt: { $gte: last24h } }),
        Message.countDocuments({ createdAt: { $gte: last24h }, isDeleted: false }),
      ]);

    // Messages per day for last 7 days
    const msgPerDay = await Message.aggregate([
      { $match: { createdAt: { $gte: last7days }, isDeleted: false } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      totalUsers, totalMessages, activeUsers, totalGroups,
      newUsersToday, messagesToday, msgPerDay,
    });
  } catch (error) {
    console.log("Error in getStats:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const query = search
      ? { $or: [{ fullName: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }] }
      : {};

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -resetPasswordOTP -resetPasswordOTPExpiry")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      User.countDocuments(query),
    ]);

    res.status(200).json({ users, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.log("Error in getAllUsers:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["user", "admin"].includes(role))
      return res.status(400).json({ message: "Invalid role" });

    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    console.log("Error in updateUserRole:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user._id.toString())
      return res.status(400).json({ message: "Cannot delete your own account" });

    await User.findByIdAndDelete(id);
    await Message.deleteMany({ $or: [{ senderId: id }, { receiverId: id }] });

    res.status(200).json({ message: "User deleted" });
  } catch (error) {
    console.log("Error in deleteUser:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
