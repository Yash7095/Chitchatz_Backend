import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { adminRoute } from "../middleware/admin.middleware.js";
import { getStats, getAllUsers, updateUserRole, deleteUser } from "../controllers/admin.controller.js";

const router = express.Router();

router.use(protectRoute, adminRoute);

router.get("/stats", getStats);
router.get("/users", getAllUsers);
router.put("/users/:id/role", updateUserRole);
router.delete("/users/:id", deleteUser);

export default router;
