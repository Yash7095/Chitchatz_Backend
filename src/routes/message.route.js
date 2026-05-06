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
  searchMessages,
  toggleBookmark,
  getBookmarks,
} from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/search", protectRoute, searchMessages);
router.get("/bookmarks", protectRoute, getBookmarks);
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
router.put("/read/:id", protectRoute, markMessagesRead);
router.put("/:id/react", protectRoute, reactToMessage);
router.put("/:id/pin", protectRoute, pinMessage);
router.put("/:id/bookmark", protectRoute, toggleBookmark);
router.get("/:id/pinned", protectRoute, getPinnedMessages);

export default router;
