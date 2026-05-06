import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./lib/db.js";
import authRoute from "./routes/auth.route.js";
import messageRoute from "./routes/message.route.js";
import statusRoute from "./routes/status.route.js";
import aiRoute from "./routes/ai.route.js";
import groupRoute from "./routes/group.route.js";
import adminRoute from "./routes/admin.route.js";
import { app, server, io, getReceiverSocketId } from "./lib/socket.js";
import Message from "./models/message.model.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 5001;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  })
);

// API routes
app.use("/api/auth", authRoute);
app.use("/api/message", messageRoute);
app.use("/api/status", statusRoute);
app.use("/api/ai", aiRoute);
app.use("/api/groups", groupRoute);
app.use("/api/admin", adminRoute);

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(__dirname, "../../Chitchatz_Frontend/dist");
  app.use(express.static(frontendDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (req, res) => res.send("API is running..."));
}

// ── Self-destruct cron — every 30 seconds ─────────────────────────────────
cron.schedule("*/30 * * * * *", async () => {
  try {
    const expired = await Message.find({
      expiresAt: { $lte: new Date() },
      isDeleted: false,
    });
    if (!expired.length) return;

    await Message.updateMany(
      { _id: { $in: expired.map((m) => m._id) } },
      { isDeleted: true }
    );

    expired.forEach((m) => {
      const payload = { messageId: m._id.toString() };
      const senderSocket = getReceiverSocketId(m.senderId.toString());
      const receiverSocket = getReceiverSocketId(m.receiverId.toString());
      if (senderSocket) io.to(senderSocket).emit("messageExpired", payload);
      if (receiverSocket) io.to(receiverSocket).emit("messageExpired", payload);
    });
  } catch (err) {
    console.log("Self-destruct cron error:", err.message);
  }
});

// ── Scheduled messages cron — every minute ────────────────────────────────
cron.schedule("* * * * *", async () => {
  try {
    const due = await Message.find({
      scheduledFor: { $lte: new Date() },
      status: "scheduled",
      isDeleted: false,
    });
    if (!due.length) return;

    await Message.updateMany(
      { _id: { $in: due.map((m) => m._id) } },
      { status: "sent" }
    );

    due.forEach((m) => {
      const receiverSocket = getReceiverSocketId(m.receiverId.toString());
      if (receiverSocket) io.to(receiverSocket).emit("newMessage", m);
    });
  } catch (err) {
    console.log("Scheduled messages cron error:", err.message);
  }
});

const listenHost = process.env.NODE_ENV === "production" ? "0.0.0.0" : "192.168.1.16";

server.listen(PORT, listenHost, () => {
  console.log(`Server running on ${listenHost}:${PORT}`);
  connectDB();
});
