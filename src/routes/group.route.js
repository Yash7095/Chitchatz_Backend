import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createGroup, getMyGroups, updateGroup,
  addMember, removeMember,
  getGroupMessages, sendGroupMessage,
  createGroupPoll, voteGroupPoll,
} from "../controllers/group.controller.js";

const router = express.Router();

router.get("/", protectRoute, getMyGroups);
router.post("/", protectRoute, createGroup);
router.put("/:id", protectRoute, updateGroup);
router.post("/:id/members", protectRoute, addMember);
router.delete("/:id/members/:userId", protectRoute, removeMember);
router.get("/:id/messages", protectRoute, getGroupMessages);
router.post("/:id/messages", protectRoute, sendGroupMessage);
router.post("/:id/poll", protectRoute, createGroupPoll);
router.put("/:id/poll/:msgId/vote", protectRoute, voteGroupPoll);

export default router;
