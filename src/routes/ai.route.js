import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getSmartReplies, summarizeConversation } from "../controllers/ai.controller.js";

const router = express.Router();

router.post("/smart-replies", protectRoute, getSmartReplies);
router.post("/summarize", protectRoute, summarizeConversation);

export default router;
