import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId },
    }).select("-password -resetPasswordOTP -resetPasswordOTPExpiry");
    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error in getUsersForSidebar:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $and: [
        {
          $or: [
            { senderId: myId, receiverId: userToChatId },
            { senderId: userToChatId, receiverId: myId },
          ],
        },
        {
          $or: [{ scheduledFor: { $exists: false } }, { scheduledFor: null }, { scheduledFor: { $lte: new Date() } }],
        },
      ],
      isDeleted: false,
    })
      .populate("replyTo", "text image video audio type senderId")
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, video, audio, replyTo, expiresIn } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl, videoUrl, audioUrl, messageType = "text";

    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
      messageType = "image";
    }
    if (video) {
      const uploadResponse = await cloudinary.uploader.upload(video, { resource_type: "video" });
      videoUrl = uploadResponse.secure_url;
      messageType = "video";
    }
    if (audio) {
      const uploadResponse = await cloudinary.uploader.upload(audio, { resource_type: "raw" });
      audioUrl = uploadResponse.secure_url;
      messageType = "audio";
    }

    const receiverSocketId = getReceiverSocketId(receiverId);
    const initialStatus = receiverSocketId ? "delivered" : "sent";

    let expiresAt = null;
    if (expiresIn) {
      const durationMap = { "30s": 30, "5m": 300, "1h": 3600, "24h": 86400 };
      const seconds = durationMap[expiresIn];
      if (seconds) expiresAt = new Date(Date.now() + seconds * 1000);
    }

    const newMessage = new Message({
      senderId, receiverId, text,
      image: imageUrl, video: videoUrl, audio: audioUrl,
      type: messageType, status: initialStatus,
      replyTo: replyTo || null, expiresAt,
    });
    await newMessage.save();

    const populatedMessage = await Message.findById(newMessage._id).populate(
      "replyTo", "text image video audio type senderId"
    );

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", populatedMessage);
    }
    if (initialStatus === "delivered") {
      const senderSocketId = getReceiverSocketId(senderId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesDelivered", { messageIds: [newMessage._id.toString()] });
      }
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.log("Error in sendMessage:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const markMessagesRead = async (req, res) => {
  try {
    const { id: senderId } = req.params;
    const receiverId = req.user._id;

    await Message.updateMany(
      { senderId, receiverId, status: { $ne: "read" } },
      { status: "read" }
    );

    const senderSocketId = getReceiverSocketId(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("messagesRead", { byUserId: receiverId.toString() });
    }
    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.log("Error in markMessagesRead:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 4.1 — React to message
export const reactToMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ message: "Message not found" });

    const existingIdx = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingIdx !== -1) {
      if (message.reactions[existingIdx].emoji === emoji) {
        message.reactions.splice(existingIdx, 1); // toggle off same emoji
      } else {
        message.reactions[existingIdx].emoji = emoji; // change emoji
      }
    } else {
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    const update = { messageId: id, reactions: message.reactions };
    const senderSocket = getReceiverSocketId(message.senderId.toString());
    const receiverSocket = getReceiverSocketId(message.receiverId.toString());
    if (senderSocket) io.to(senderSocket).emit("reactionUpdate", update);
    if (receiverSocket) io.to(receiverSocket).emit("reactionUpdate", update);

    res.status(200).json(message.reactions);
  } catch (error) {
    console.log("Error in reactToMessage:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 4.5 — Pin / unpin message
export const pinMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ message: "Message not found" });

    message.isPinned = !message.isPinned;
    await message.save();

    const update = { messageId: id, isPinned: message.isPinned };
    const senderSocket = getReceiverSocketId(message.senderId.toString());
    const receiverSocket = getReceiverSocketId(message.receiverId.toString());
    if (senderSocket) io.to(senderSocket).emit("messagePinned", update);
    if (receiverSocket) io.to(receiverSocket).emit("messagePinned", update);

    res.status(200).json({ isPinned: message.isPinned });
  } catch (error) {
    console.log("Error in pinMessage:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getPinnedMessages = async (req, res) => {
  try {
    const { id: otherUserId } = req.params;
    const myId = req.user._id;

    const pinned = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: myId },
      ],
      isPinned: true,
      isDeleted: false,
    }).sort({ createdAt: -1 }).limit(10);

    res.status(200).json(pinned);
  } catch (error) {
    console.log("Error in getPinnedMessages:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 8.1 — Search messages
export const searchMessages = async (req, res) => {
  try {
    const { q } = req.query;
    const myId = req.user._id;

    if (!q || q.trim().length < 2) return res.status(200).json([]);

    const results = await Message.find({
      $or: [{ senderId: myId }, { receiverId: myId }],
      text: { $regex: q.trim(), $options: "i" },
      isDeleted: false,
    })
      .populate("senderId", "fullName profilePic")
      .populate("receiverId", "fullName profilePic")
      .sort({ createdAt: -1 })
      .limit(30);

    res.status(200).json(results);
  } catch (error) {
    console.log("Error in searchMessages:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 8.6 — Toggle bookmark
export const toggleBookmark = async (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user._id;

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ message: "Message not found" });

    const isParticipant =
      message.senderId.toString() === myId.toString() ||
      message.receiverId.toString() === myId.toString();
    if (!isParticipant) return res.status(403).json({ message: "Not authorized" });

    message.isBookmarked = !message.isBookmarked;
    await message.save();

    res.status(200).json({ isBookmarked: message.isBookmarked });
  } catch (error) {
    console.log("Error in toggleBookmark:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 8.6 — Get bookmarked messages
export const getBookmarks = async (req, res) => {
  try {
    const myId = req.user._id;

    const bookmarks = await Message.find({
      $or: [{ senderId: myId }, { receiverId: myId }],
      isBookmarked: true,
      isDeleted: false,
    })
      .populate("senderId", "fullName profilePic")
      .populate("receiverId", "fullName profilePic")
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json(bookmarks);
  } catch (error) {
    console.log("Error in getBookmarks:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
