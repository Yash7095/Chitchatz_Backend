import cloudinary from "../lib/cloudinary.js";
import Group from "../models/group.model.js";
import GroupMessage from "../models/groupMessage.model.js";
import { io, getReceiverSocketId } from "../lib/socket.js";

// ── Group CRUD ────────────────────────────────────────────────────────────────

export const createGroup = async (req, res) => {
  try {
    const { name, description, memberIds, groupPic } = req.body;
    const createdBy = req.user._id;

    if (!name) return res.status(400).json({ message: "Group name is required" });

    let groupPicUrl = "";
    if (groupPic) {
      const upload = await cloudinary.uploader.upload(groupPic);
      groupPicUrl = upload.secure_url;
    }

    const members = [
      { userId: createdBy, role: "admin" },
      ...(memberIds || []).map((id) => ({ userId: id, role: "member" })),
    ];

    const group = new Group({ name, description, groupPic: groupPicUrl, createdBy, members });
    await group.save();

    const populated = await Group.findById(group._id).populate("members.userId", "fullName profilePic username");

    // Notify all members via socket
    members.forEach(({ userId }) => {
      const socketId = getReceiverSocketId(userId.toString());
      if (socketId) io.to(socketId).emit("groupCreated", populated);
    });

    res.status(201).json(populated);
  } catch (error) {
    console.log("Error in createGroup:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await Group.find({ "members.userId": userId })
      .populate("members.userId", "fullName profilePic username isOnline")
      .sort({ updatedAt: -1 });
    res.status(200).json(groups);
  } catch (error) {
    console.log("Error in getMyGroups:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, groupPic } = req.body;
    const userId = req.user._id;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const member = group.members.find((m) => m.userId.toString() === userId.toString());
    if (!member || member.role !== "admin")
      return res.status(403).json({ message: "Only admins can update the group" });

    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (groupPic) {
      const upload = await cloudinary.uploader.upload(groupPic);
      group.groupPic = upload.secure_url;
    }

    await group.save();
    const populated = await Group.findById(id).populate("members.userId", "fullName profilePic username isOnline");

    // Notify all members
    group.members.forEach(({ userId: uid }) => {
      const socketId = getReceiverSocketId(uid.toString());
      if (socketId) io.to(socketId).emit("groupUpdated", populated);
    });

    res.status(200).json(populated);
  } catch (error) {
    console.log("Error in updateGroup:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: newUserId } = req.body;
    const requesterId = req.user._id;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const requester = group.members.find((m) => m.userId.toString() === requesterId.toString());
    if (!requester || requester.role !== "admin")
      return res.status(403).json({ message: "Only admins can add members" });

    const alreadyMember = group.members.some((m) => m.userId.toString() === newUserId);
    if (alreadyMember) return res.status(400).json({ message: "User is already a member" });

    group.members.push({ userId: newUserId, role: "member" });
    await group.save();

    const populated = await Group.findById(id).populate("members.userId", "fullName profilePic username isOnline");

    const newMemberSocket = getReceiverSocketId(newUserId);
    if (newMemberSocket) io.to(newMemberSocket).emit("groupCreated", populated);

    group.members.forEach(({ userId: uid }) => {
      const socketId = getReceiverSocketId(uid.toString());
      if (socketId) io.to(socketId).emit("groupUpdated", populated);
    });

    res.status(200).json(populated);
  } catch (error) {
    console.log("Error in addMember:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const removeMember = async (req, res) => {
  try {
    const { id, userId: targetUserId } = req.params;
    const requesterId = req.user._id;

    const group = await Group.findById(id);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const requester = group.members.find((m) => m.userId.toString() === requesterId.toString());
    const isSelf = requesterId.toString() === targetUserId;

    if (!isSelf && (!requester || requester.role !== "admin"))
      return res.status(403).json({ message: "Only admins can remove members" });

    group.members = group.members.filter((m) => m.userId.toString() !== targetUserId);
    await group.save();

    const removedSocket = getReceiverSocketId(targetUserId);
    if (removedSocket) io.to(removedSocket).emit("removedFromGroup", { groupId: id });

    group.members.forEach(({ userId: uid }) => {
      const socketId = getReceiverSocketId(uid.toString());
      if (socketId) io.to(socketId).emit("groupUpdated", group);
    });

    res.status(200).json({ message: "Member removed" });
  } catch (error) {
    console.log("Error in removeMember:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ── Group Messages ────────────────────────────────────────────────────────────

export const getGroupMessages = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const userId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const isMember = group.members.some((m) => m.userId.toString() === userId.toString());
    if (!isMember) return res.status(403).json({ message: "Not a member of this group" });

    const messages = await GroupMessage.find({ groupId, isDeleted: false })
      .populate("senderId", "fullName profilePic username")
      .populate("replyTo", "text image type senderId")
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getGroupMessages:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const { text, image, video, audio, replyTo } = req.body;
    const senderId = req.user._id;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const isMember = group.members.some((m) => m.userId.toString() === senderId.toString());
    if (!isMember) return res.status(403).json({ message: "Not a member of this group" });

    let imageUrl, videoUrl, audioUrl, messageType = "text";
    if (image) {
      imageUrl = (await cloudinary.uploader.upload(image)).secure_url;
      messageType = "image";
    }
    if (video) {
      videoUrl = (await cloudinary.uploader.upload(video, { resource_type: "video" })).secure_url;
      messageType = "video";
    }
    if (audio) {
      audioUrl = (await cloudinary.uploader.upload(audio, { resource_type: "raw" })).secure_url;
      messageType = "audio";
    }

    const newMessage = new GroupMessage({
      groupId, senderId,
      text, image: imageUrl, video: videoUrl, audio: audioUrl,
      type: messageType, replyTo: replyTo || null,
    });
    await newMessage.save();

    const populated = await GroupMessage.findById(newMessage._id)
      .populate("senderId", "fullName profilePic username")
      .populate("replyTo", "text image type senderId");

    // Emit to all members
    group.members.forEach(({ userId }) => {
      if (userId.toString() === senderId.toString()) return;
      const socketId = getReceiverSocketId(userId.toString());
      if (socketId) io.to(socketId).emit("newGroupMessage", { groupId, message: populated });
    });

    // Update group's updatedAt for sorting
    await Group.findByIdAndUpdate(groupId, { updatedAt: new Date() });

    res.status(201).json(populated);
  } catch (error) {
    console.log("Error in sendGroupMessage:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
