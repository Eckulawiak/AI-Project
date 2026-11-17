import express from "express";
import { RequireAdmin } from "../Middleware/RequireAuth.js";
import {
  getAuditLogs,
  exportAuditLogs,
} from "../Controllers/AuditController.js";

// Audit logs list every user's email and logins: admins only.
const router = express.Router();

router.get("/", RequireAdmin, getAuditLogs);
router.get("/export", RequireAdmin, exportAuditLogs);

export default router;
