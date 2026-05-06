import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getUsersForSidebar,
  getMessages,
  sendMessage,
  markMessagesRead,
  reactToMessage,
  pinMessage,
  getPinnedMessages,
} from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
router.put("/read/:id", protectRoute, markMessagesRead);
router.put("/:id/react", protectRoute, reactToMessage);
router.put("/:id/pin", protectRoute, pinMessage);
router.get("/:id/pinned", protectRoute, getPinnedMessages);

export default router;
