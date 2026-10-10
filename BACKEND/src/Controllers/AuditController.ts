import { type Request, type Response } from "express";
import { supabase } from "../Database/supabaseClient.js";

// GET /api/audit-logs
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, role } = req.query;

    let query = supabase
      .from("auditlogs")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply Date Filters
    if (startDate && typeof startDate === "string") {
      query = query.gte("created_at", startDate);
    }
    if (endDate && typeof endDate === "string") {
      // Append time to include the entire end day
      query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
    }

    // Apply Role Filter - Convert to uppercase to match DB values (ADMIN, FACULTY, STUDENT)
    if (role && typeof role === "string" && role !== "All") {
      query = query.eq("user_type", role.toUpperCase());
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error fetching audit logs:", error);
      return res.status(500).json({ error: "Failed to fetch audit logs" });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Server error in audit logs router:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/audit-logs/export
export const exportAuditLogs = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, role } = req.query;

    let query = supabase
      .from("auditlogs")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply same filters to export
    if (startDate && typeof startDate === "string") {
      query = query.gte("created_at", startDate);
    }
    if (endDate && typeof endDate === "string") {
      query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
    }
    
    // Apply Role Filter - Convert to uppercase to match DB values
    if (role && typeof role === "string" && role !== "All") {
      query = query.eq("user_type", role.toUpperCase());
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error fetching audit logs for export:", error);
      return res
        .status(500)
        .json({ error: "Failed to fetch audit logs for export" });
    }

    const headers = [
      "Log ID",
      "Timestamp",
      "User Email",
      "User ID",
      "Role",
      "Action",
    ];
    const csvRows = [headers.join(",")];

    if (data) {
      for (const log of data) {
        const email = `"${log.email.replace(/"/g, '""')}"`;
        const timestamp = `"${new Date(log.created_at).toLocaleString()}"`;
        csvRows.push(
          [
            log.id,
            timestamp,
            email,
            log.user_id,
            log.user_type,
            log.action,
          ].join(","),
        );
      }
    }

    const csvContent = csvRows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="system_audit_logs_${new Date().toISOString().split("T")[0]}.csv"`,
    );
    res.status(200).send(csvContent);
  } catch (error) {
    console.error("Server error generating audit log export:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};