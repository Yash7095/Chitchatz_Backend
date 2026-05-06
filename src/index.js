import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import { connectDB } from "./lib/db.js";
import authRoute from "./routes/auth.route.js";
import messageRoute from "./routes/message.route.js";
import { app, server } from "./lib/socket.js";

dotenv.config();

const PORT = process.env.PORT;

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// app.use(
//   cors({
//     origin: "http://localhost:5173",
//     credentials: true,
//   }),
// );

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.get("/", (req, res) => {
  res.send("API is running...");
});
app.use("/api/auth", authRoute);
app.use("/api/message", messageRoute);

// server.listen(PORT, () => {
//   console.log("server started at PORT:", PORT);
//   connectDB();
// });

server.listen(PORT, "192.168.1.16", () => {
  console.log("server started at PORT:", PORT);
  connectDB();
});
