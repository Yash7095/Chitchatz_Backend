import { Server } from "socket.io";
import http from "http";
import express from "express";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://192.168.1.16:5173",
    credentials: true,
  },
});

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

const userSocketMap = {}; // { userId: socketId }

io.on("connection", async (socket) => {
  console.log("a user connected", socket.id);

  const userId = socket.handshake.query.userId;

  if (userId) {
    userSocketMap[userId] = socket.id;

    // Mark user online + update lastSeen
    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });

    // Deliver any messages that arrived while user was offline
    const undelivered = await Message.find({
      receiverId: userId,
      status: "sent",
    });
    if (undelivered.length > 0) {
      const ids = undelivered.map((m) => m._id);
      await Message.updateMany({ _id: { $in: ids } }, { status: "delivered" });
      // Notify senders their messages were delivered
      const grouped = {};
      undelivered.forEach((m) => {
        const sid = m.senderId.toString();
        if (!grouped[sid]) grouped[sid] = [];
        grouped[sid].push(m._id.toString());
      });
      Object.entries(grouped).forEach(([senderId, msgIds]) => {
        const senderSocket = userSocketMap[senderId];
        if (senderSocket) {
          io.to(senderSocket).emit("messagesDelivered", { messageIds: msgIds });
        }
      });
    }
  }

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // --- Typing events ---
  socket.on("typing", ({ receiverId }) => {
    const receiverSocket = userSocketMap[receiverId];
    if (receiverSocket) {
      io.to(receiverSocket).emit("userTyping", { senderId: userId });
    }
  });

  socket.on("stopTyping", ({ receiverId }) => {
    const receiverSocket = userSocketMap[receiverId];
    if (receiverSocket) {
      io.to(receiverSocket).emit("userStopTyping", { senderId: userId });
    }
  });

  // --- Read receipts ---
  socket.on("markRead", async ({ senderId, conversationUserId }) => {
    try {
      // Mark all messages from conversationUserId to this user as read
      const result = await Message.updateMany(
        {
          senderId: conversationUserId,
          receiverId: userId,
          status: { $ne: "read" },
        },
        { status: "read" }
      );

      if (result.modifiedCount > 0) {
        const senderSocket = userSocketMap[conversationUserId];
        if (senderSocket) {
          io.to(senderSocket).emit("messagesRead", { byUserId: userId });
        }
      }
    } catch (err) {
      console.log("Error marking messages read:", err.message);
    }
  });

  socket.on("disconnect", async () => {
    console.log("user disconnected", socket.id);
    if (userId) {
      delete userSocketMap[userId];
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, server, app };
