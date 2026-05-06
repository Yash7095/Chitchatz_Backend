import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createGroup, getMyGroups, updateGroup,
  addMember, removeMember,
  getGroupMessages, sendGroupMessage,
} from "../controllers/group.controller.js";

const router = express.Router();

router.get("/", protectRoute, getMyGroups);
router.post("/", protectRoute, createGroup);
router.put("/:id", protectRoute, updateGroup);
router.post("/:id/members", protectRoute, addMember);
router.delete("/:id/members/:userId", protectRoute, removeMember);
router.get("/:id/messages", protectRoute, getGroupMessages);
router.post("/:id/messages", protectRoute, sendGroupMessage);

export default router;
