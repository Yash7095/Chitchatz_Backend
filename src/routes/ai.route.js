import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getSmartReplies } from "../controllers/ai.controller.js";

const router = express.Router();

router.post("/smart-replies", protectRoute, getSmartReplies);

export default router;
