import { type Request, type Response } from "express";
import { supabase } from "../Database/supabaseClient.js";
import { findFacultyByEmail, findStudentByEmail } from "../Models/UserModel.js";
import { verifyPassword, hashPassword } from "../Utils/password.js";
import { signToken } from "../Utils/jwt.js";
import { getMajors } from "../Models/MajorsModel.js";
import { findMajorByName } from "../Models/MajorModel.js";
import nodemailer from "nodemailer";

// --- 1. LOGIN & LOGOUT ---

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const fullEmail = email.endsWith("@quinnipiac.edu")
    ? email
    : `${email}@quinnipiac.edu`;

  // Check Student table
  const student = await findStudentByEmail(fullEmail);
  if (student && (await verifyPassword(password, student.password))) {
    const token = signToken({
      userId: student.student_id,
      userType: "Student",
      userEmail: student.student_qu_email,
    });

    try {
      await supabase.from("auditlogs").insert({
        user_id: student.student_id,
        email: student.student_qu_email || fullEmail,
        user_type: "STUDENT",
        action: "LOGIN",
      });
    } catch (auditError) {
      console.error("Failed to insert student audit log:", auditError);
    }

    return res.json({ token, userType: "Student" });
  }

  // Check Faculty table
  const faculty = await findFacultyByEmail(fullEmail);
  if (faculty && (await verifyPassword(password, faculty.password))) {
    const userTypeStr =
      faculty.type === true ? "Administrator" : "Faculty/Administrator";
    const token = signToken({
      userId: faculty.faculty_id,
      userType: userTypeStr,
      userEmail: fullEmail,
    });

    try {
      await supabase.from("auditlogs").insert({
        user_id: faculty.faculty_id,
        email: fullEmail,
        user_type: faculty.type === true ? "ADMIN" : "FACULTY",
        action: "LOGIN",
      });
    } catch (auditError) {
      console.error("Failed to insert faculty/admin audit log:", auditError);
    }

    return res.json({ token, userType: userTypeStr });
  }

  return res.status(401).json({ error: "Invalid email or password" });
};

export const logout = async (req: Request, res: Response) => {
  const { user_id, email, user_type } = req.body;
  if (user_id && email && user_type) {
    try {
      await supabase.from("auditlogs").insert({
        user_id,
        email,
        user_type,
        action: "LOGOUT",
      });
    } catch (auditError) {
      console.error("Failed to insert logout audit log:", auditError);
    }
  }
  return res.json({ message: "Logged out successfully" });
};

// --- 2. REGISTRATION ---

export const fetchMajors = async (_req: Request, res: Response) => {
  try {
    const majors = await getMajors();
    res.json(majors);
  } catch (error: any) {
    console.error("Error fetching majors:", error);
    res.status(500).json({ error: "Failed to fetch majors" });
  }
};

export const register = async (req: Request, res: Response) => {
  const { userType, firstName, lastName, email, major, password } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const fullEmail = `${email}@quinnipiac.edu`;
  const hashedPassword = await hashPassword(password);

  if (userType === "Student") {
    const { data: existing } = await supabase
      .from("student")
      .select("student_id")
      .eq("student_qu_email", fullEmail)
      .single();

    if (existing)
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });

    const majorRow = major ? await findMajorByName(major) : null;

    const { data, error } = await supabase
      .from("student")
      .insert({
        student_qu_email: fullEmail,
        password: hashedPassword,
        firstname: firstName,
        lastname: lastName,
        major: major,
        major_id: majorRow?.id ?? null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const token = signToken({
      userId: data.student_id,
      userType: "Student",
      userEmail: data.student_qu_email,
    });
    return res.status(201).json({
      token,
      userId: data.student_id,
      userType: "Student",
      userEmail: data.student_qu_email,
    });
  } else {
    // Admin self-signup is for dev/testing only and must be switched on
    // explicitly with ALLOW_ADMIN_SIGNUP=true.
    const isAdmin = userType === "Administrator";
    if (isAdmin && process.env.ALLOW_ADMIN_SIGNUP !== "true") {
      return res
        .status(403)
        .json({ error: "Administrator sign-up is disabled" });
    }
    const sessionType = isAdmin ? "Administrator" : "Faculty/Administrator";

    const { data: existing } = await supabase
      .from("faculty_admin")
      .select("faculty_id")
      .eq("faculty_qu_email", fullEmail)
      .single();

    if (existing)
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });

    const { data, error } = await supabase
      .from("faculty_admin")
      .insert({
        faculty_qu_email: fullEmail,
        password: hashedPassword,
        firstname: firstName,
        lastname: lastName,
        type: isAdmin,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const token = signToken({
      userId: data.faculty_id,
      userType: sessionType,
      userEmail: data.faculty_qu_email,
    });
    return res.status(201).json({
      token,
      userId: data.faculty_id,
      userType: sessionType,
      userEmail: data.faculty_qu_email,
    });
  }
};

// --- 3. PASSWORD RESET ---

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendResetEmail(toEmail: string, code: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  await transporter.sendMail({
    from: `"QU Career Services" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "Your Password Reset Code",
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Use the code below to reset your Quinnipiac account password. It expires in <strong>15 minutes</strong>.</p>
        <div style="font-size: 2rem; font-weight: bold; letter-spacing: 5px; text-align: center; margin: 20px 0;">${code}</div>
        <p>If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const fullEmail = email.endsWith("@quinnipiac.edu")
      ? email
      : `${email}@quinnipiac.edu`;
    const student = await findStudentByEmail(fullEmail);
    const faculty = student ? null : await findFacultyByEmail(fullEmail);
    const user = student ?? faculty;

    if (!user)
      return res.json({
        message: "If that email matches an account, a reset code was sent.",
      });

    const code = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    if (student) {
      await supabase
        .from("student")
        .update({ reset_code: code, reset_code_expiry: expiry })
        .eq("student_id", student.student_id);
    } else {
      await supabase
        .from("faculty_admin")
        .update({ reset_code: code, reset_code_expiry: expiry })
        .eq("faculty_id", faculty!.faculty_id);
    }

    await sendResetEmail(fullEmail, code);
    res.json({
      message: "If that email matches an account, a reset code was sent.",
    });
  } catch (error: any) {
    console.error("Forgot Password Error:", error);
    res
      .status(500)
      .json({ error: "Failed to process forgot password request." });
  }
};

export const verifyCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ error: "Email and code are required" });

    const fullEmail = email.endsWith("@quinnipiac.edu")
      ? email
      : `${email}@quinnipiac.edu`;
    const student = await findStudentByEmail(fullEmail);
    const faculty = student ? null : await findFacultyByEmail(fullEmail);
    const user = student ?? faculty;

    if (!user) return res.status(400).json({ error: "Invalid request" });

    const storedCode = (user as any).reset_code;
    const expiry: string = (user as any).reset_code_expiry;

    if (!storedCode || storedCode !== code)
      return res.status(400).json({ error: "Invalid or expired code" });
    if (new Date(expiry) < new Date())
      return res.status(400).json({ error: "Code has expired" });

    res.json({ message: "Code verified" });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to verify code" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword)
      return res.status(400).json({ error: "All fields are required" });

    const fullEmail = email.endsWith("@quinnipiac.edu")
      ? email
      : `${email}@quinnipiac.edu`;
    const student = await findStudentByEmail(fullEmail);
    const faculty = student ? null : await findFacultyByEmail(fullEmail);
    const user = student ?? faculty;

    if (!user) return res.status(400).json({ error: "Invalid request" });

    const storedCode = (user as any).reset_code;
    const expiry: string = (user as any).reset_code_expiry;

    if (!storedCode || storedCode !== code)
      return res.status(400).json({ error: "Invalid or expired code" });
    if (new Date(expiry) < new Date())
      return res.status(400).json({ error: "Code has expired" });

    const hashed = await hashPassword(newPassword);

    if (student) {
      await supabase
        .from("student")
        .update({ password: hashed, reset_code: null, reset_code_expiry: null })
        .eq("student_id", student.student_id);
      const token = signToken({
        userId: student.student_id,
        userType: "Student",
        userEmail: student.student_qu_email,
      });
      return res.json({ token, userType: "Student" });
    } else {
      await supabase
        .from("faculty_admin")
        .update({ password: hashed, reset_code: null, reset_code_expiry: null })
        .eq("faculty_id", faculty!.faculty_id);
      const userTypeStr =
        faculty!.type === true ? "Administrator" : "Faculty/Administrator";
      const token = signToken({
        userId: faculty!.faculty_id,
        userType: userTypeStr,
        userEmail: faculty!.faculty_qu_email,
      });
      return res.json({ token, userType: userTypeStr });
    }
  } catch (e: unknown) {
    res.status(500).json({ error: "Internal error resetting password" });
  }
};

// --- 4. PROFILE MANAGEMENT ---

export const getProfile = async (req: Request, res: Response) => {
  try {
    const { userId, userType } = req.user!;

    if (userType === "Student") {
      const { data, error } = await supabase
        .from("student")
        .select("firstname, lastname, student_qu_email, major, major_id")
        .eq("student_id", userId)
        .single();
      if (error || !data)
        return res.status(404).json({ error: "Student account not found" });
      return res.json({
        firstName: data.firstname,
        lastName: data.lastname,
        email: data.student_qu_email,
        major: data.major,
        majorId: data.major_id,
      });
    } else {
      const { data, error } = await supabase
        .from("faculty_admin")
        .select("firstname, lastname, faculty_qu_email")
        .eq("faculty_id", userId)
        .single();
      if (error || !data)
        return res.status(404).json({ error: "Faculty account not found" });
      return res.json({
        firstName: data.firstname,
        lastName: data.lastname,
        email: data.faculty_qu_email,
      });
    }
  } catch (e: unknown) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { userId, userType } = req.user!;
    const { firstName, lastName, major, password } = req.body;

    if (!firstName?.trim() || !lastName?.trim()) {
      return res
        .status(400)
        .json({ error: "First and last name are required" });
    }
    if (password && password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const updatePayload: Record<string, any> = {
      firstname: firstName.trim(),
      lastname: lastName.trim(),
    };
    if (password) updatePayload.password = await hashPassword(password);

    if (userType === "Student") {
      if (major !== undefined) {
        updatePayload.major = major.trim();
        updatePayload.major_id =
          (await findMajorByName(major.trim()))?.id ?? null;
      }
      const { error } = await supabase
        .from("student")
        .update(updatePayload)
        .eq("student_id", userId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("faculty_admin")
        .update(updatePayload)
        .eq("faculty_id", userId);
      if (error) throw error;
    }

    res.json({ message: "Profile updated successfully" });
  } catch (e: unknown) {
    res.status(500).json({ error: "Failed to update profile" });
  }
};
