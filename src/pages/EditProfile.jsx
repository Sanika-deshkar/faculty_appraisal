import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_INFO } from "../constants/formConfig";
import {
  SCHOOL_OPTIONS,
  SOEMR_DEPARTMENTS,
  canonicalDepartmentValue,
  canonicalSchoolValue,
  isCisrSchool,
  isSoemrSchool,
  isValidSchool,
  isValidSoemrDepartment,
} from "../constants/universityHierarchy";
import { isNonTeachingRole } from "../constants/nonTeachingHierarchy";
import { buildProfilePayload, normalizeRole, storeUserSession } from "../auth/session";
import { updateProfile } from "../services/authService";
import {
  isValidPhone, isValidName, isValidEmployeeId, isValidExperience,
  sanitizeText, filterNumeric, filterPhone,
} from "../utils/validation";

const ROLE_LABEL = {
  faculty: "Faculty",
  hod: "Head of Department",
  center_head: "Center Head",
  non_teaching_staff: "Non-Teaching Staff",
  reporting_officer: "Reporting Officer",
  registrar: "Registrar",
  director: "Director",
  dean: "Dean",
  vc: "Vice Chancellor",
};

const BASE_ROLE_OPTIONS = [
  { value: "faculty", label: "Faculty" },
  { value: "hod", label: "HOD" },
  { value: "center_head", label: "Center Head" },
  { value: "dean", label: "Dean" },
  { value: "director", label: "Director" },
  { value: "vc", label: "Vice Chancellor" },
  { value: "registrar", label: "Registrar" },
  { value: "reporting_officer", label: "Reporting Officer" },
  { value: "non_teaching_staff", label: "Non-Teaching Staff" },
];

const STAFF_TYPE_LABEL = {
  teaching: "Teaching",
  non_teaching: "Non-Teaching",
};

const initialsFromName = (name = "") =>
  String(name || "U")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

export default function EditProfile() {
  const navigate = useNavigate();
  const initialRole = normalizeRole(sessionStorage.getItem("role"), "faculty");
  const initialSchool = canonicalSchoolValue(sessionStorage.getItem("school"));
  const initialDepartment = isNonTeachingRole(initialRole)
    ? sessionStorage.getItem("department") || ""
    : canonicalDepartmentValue(sessionStorage.getItem("department"));

  const [formData, setFormData] = useState({
    staffType: isNonTeachingRole(initialRole) ? "non_teaching" : "teaching",
    email: sessionStorage.getItem("username") || "",
    name: sessionStorage.getItem("name") || "",
    employeeId: sessionStorage.getItem("employeeId") || "",
    designation: sessionStorage.getItem("designation") || "",
    qualification: sessionStorage.getItem("qualification") || "",
    experience: sessionStorage.getItem("experience") || "",
    phone: sessionStorage.getItem("phone") || "",
    school: initialSchool,
    department: initialDepartment,
    role: initialRole,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedSchool = useMemo(() => canonicalSchoolValue(formData.school), [formData.school]);
  const selectedRole = normalizeRole(formData.role, "");
  const isNonTeaching = formData.staffType === "non_teaching";
  const requiresSchool = !isNonTeaching && selectedRole !== "vc";
  const schoolNeedsDepartment = isSoemrSchool(selectedSchool);
  const isCisr = isCisrSchool(selectedSchool);
  const needsDepartment = !isNonTeaching && schoolNeedsDepartment;
  const roleOptions = BASE_ROLE_OPTIONS.filter((role) => {
    const optionIsNonTeaching = isNonTeachingRole(role.value);

    if (isNonTeaching) return optionIsNonTeaching;
    if (optionIsNonTeaching) return false;
    if (role.value === "hod") return schoolNeedsDepartment;
    if (role.value === "center_head") return isCisr;
    if (isCisr && (role.value === "director" || role.value === "dean")) return false;
    return true;
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => {
      if (name === "school") {
        return { ...prev, school: value, role: "", department: "" };
      }
      if (name === "experience") {
        return { ...prev, experience: filterNumeric(value) };
      }
      if (name === "phone") {
        return { ...prev, phone: filterPhone(value) };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!formData.employeeId.trim()) {
      setError("Employee ID is required.");
      return;
    }

    if (!isValidEmployeeId(formData.employeeId)) {
      setError("Employee ID must be 2–30 characters and contain only letters, numbers, /, - or _.");
      return;
    }

    if (!formData.designation.trim()) {
      setError("Designation is required.");
      return;
    }

    if (formData.experience && !isValidExperience(formData.experience)) {
      setError("Experience must be a number between 0 and 80.");
      return;
    }

    if (formData.phone && !isValidPhone(formData.phone)) {
      setError("Please enter a valid phone number.");
      return;
    }

    setSaving(true);
    try {
      const email = String(formData.email || "").trim().toLowerCase();
      const role = normalizeRole(formData.role, "");
      const nonTeaching = formData.staffType === "non_teaching";
      const school = canonicalSchoolValue(formData.school);
      const department = nonTeaching
        ? String(formData.department || "").trim()
        : isSoemrSchool(school)
          ? canonicalDepartmentValue(formData.department)
          : "";

      const cleanFormData = {
        ...formData,
        email,
        name: sanitizeText(formData.name),
        employeeId: sanitizeText(formData.employeeId),
        designation: sanitizeText(formData.designation),
        qualification: sanitizeText(formData.qualification),
        experience: sanitizeText(formData.experience),
        phone: sanitizeText(formData.phone),
        role,
        school: nonTeaching ? "" : school,
        department,
      };
      const profilePayload = buildProfilePayload(cleanFormData, APP_INFO.DEFAULT_AY);
      const savedProfile = await updateProfile(profilePayload);

      storeUserSession({
        profile: savedProfile || profilePayload,
        fallbackEmail: email,
      });

      setMessage("Profile updated successfully.");
      setTimeout(() => navigate("/dashboard", { replace: true }), 450);
    } catch (err) {
      setError(err?.message || "Unable to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.topBar}>
        <div style={S.brand}>
          <div style={S.logo}>FA</div>
          <div>
            <div style={S.portal}>{APP_INFO.PORTAL_NAME}</div>
            <div style={S.university}>{APP_INFO.UNIVERSITY_NAME}</div>
          </div>
        </div>
        <button onClick={() => navigate("/dashboard")} style={S.backBtn}>Back to Dashboard</button>
      </div>

      <main style={S.main}>
        <div style={S.header}>
          <div style={S.avatar}>{initialsFromName(formData.name)}</div>
          <div>
            <h1 style={S.title}>Edit Profile</h1>
            <div style={S.subTitle}>{ROLE_LABEL[formData.role] || "User"} profile details</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={S.card}>
          {error && <div style={S.error}>{error}</div>}
          {message && <div style={S.success}>{message}</div>}

          {/* ── Frozen fields ── */}
          <div style={S.sectionLabel}>Account Information <span style={S.frozenBadge}>🔒 Read-only</span></div>
          <div style={S.grid}>
            <Field label="Staff Type">
              <input style={S.frozen} value={STAFF_TYPE_LABEL[formData.staffType]} readOnly />
            </Field>
            <Field label="Role">
              <input style={S.frozen} value={ROLE_LABEL[formData.role] || formData.role} readOnly />
            </Field>
            {!isNonTeaching && (
              <Field label="School" wide>
                <input style={S.frozen} value={formData.school} readOnly />
              </Field>
            )}
            {(needsDepartment || isNonTeaching) && (
              <Field label={isNonTeaching ? "Department / Office" : "SoEMR Department"}>
                <input style={S.frozen} value={formData.department} readOnly />
              </Field>
            )}
            <Field label="Email">
              <input style={S.frozen} value={formData.email} readOnly />
            </Field>
            <Field label="Full Name">
              <input style={S.frozen} value={formData.name} readOnly />
            </Field>
          </div>

          {/* ── Editable fields ── */}
          <div style={{ ...S.sectionLabel, marginTop: 22 }}>Your Details <span style={S.editableBadge}>Editable</span></div>
          <div style={S.grid}>
            <Field label="Employee ID" required>
              <input style={S.input} name="employeeId" value={formData.employeeId} onChange={handleChange} required maxLength={30} placeholder="e.g. EMP001" />
            </Field>
            <Field label="Designation" required>
              <input style={S.input} name="designation" value={formData.designation} onChange={handleChange} required maxLength={100} placeholder="e.g. Assistant Professor" />
            </Field>
            <Field label="Qualification">
              <input style={S.input} name="qualification" value={formData.qualification} onChange={handleChange} maxLength={100} placeholder="e.g. Ph.D, M.Tech" />
            </Field>
            <Field label="Experience (Years)">
              <input style={S.input} name="experience" value={formData.experience} onChange={handleChange} inputMode="decimal" maxLength={4} placeholder="e.g. 10" />
            </Field>
            <Field label="Phone">
              <input style={S.input} name="phone" value={formData.phone} onChange={handleChange} inputMode="tel" maxLength={20} placeholder="e.g. +91 98765 43210" />
            </Field>
          </div>

          <div style={S.actions}>
            <button type="button" onClick={() => navigate("/dashboard")} style={S.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...S.saveBtn, opacity: saving ? 0.72 : 1, cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, required = false, wide = false, children }) {
  return (
    <label style={{ ...S.field, gridColumn: wide ? "1 / -1" : undefined }}>
      <span style={S.label}>{label}{required ? " *" : ""}</span>
      {children}
    </label>
  );
}

const S = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: "inherit",
  },
  topBar: {
    background: "#0f172a",
    padding: "14px 28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "linear-gradient(135deg,#6366f1,#0ea5e9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 800,
    fontSize: 12,
  },
  portal: {
    color: "#f1f5f9",
    fontWeight: 700,
    fontSize: 13,
  },
  university: {
    color: "#64748b",
    fontSize: 9,
    marginTop: 1,
  },
  backBtn: {
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#e2e8f0",
    borderRadius: 8,
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
    fontFamily: "inherit",
  },
  main: {
    maxWidth: 880,
    margin: "0 auto",
    padding: "34px 24px 56px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: "50%",
    background: "linear-gradient(135deg,#6366f1,#0ea5e9)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 18,
    letterSpacing: 1,
  },
  title: {
    margin: 0,
    fontSize: 24,
  },
  subTitle: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 4,
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    boxShadow: "0 10px 28px rgba(15,23,42,0.08)",
    padding: "24px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    color: "#475569",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  input: {
    width: "100%",
    border: "1.5px solid #e2e8f0",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    color: "#0f172a",
    outline: "none",
    fontFamily: "inherit",
    background: "#fff",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  },
  frozen: {
    width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8,
    padding: "10px 12px", fontSize: 13, color: "#94a3b8",
    background: "#f1f5f9", cursor: "not-allowed", userSelect: "none",
    fontFamily: "inherit", boxSizing: "border-box",
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: "#475569",
    textTransform: "uppercase", letterSpacing: 0.8,
    marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
  },
  frozenBadge: {
    fontSize: 9, fontWeight: 700, background: "#f1f5f9", color: "#94a3b8",
    border: "1px solid #e2e8f0", borderRadius: 4, padding: "2px 7px",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  editableBadge: {
    fontSize: 9, fontWeight: 700, background: "#eff6ff", color: "#2563eb",
    border: "1px solid #bfdbfe", borderRadius: 4, padding: "2px 7px",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 24,
    paddingTop: 20,
    borderTop: "1px solid #f1f5f9",
  },
  cancelBtn: {
    border: "1.5px solid #e2e8f0",
    background: "#fff",
    color: "#475569",
    borderRadius: 8,
    padding: "10px 20px",
    cursor: "pointer",
    fontWeight: 600,
    fontFamily: "inherit",
    fontSize: 13,
    transition: "background 0.15s, border-color 0.15s",
  },
  saveBtn: {
    border: "none",
    background: "#2563eb",
    color: "#fff",
    borderRadius: 8,
    padding: "10px 24px",
    cursor: "pointer",
    fontWeight: 700,
    fontFamily: "inherit",
    fontSize: 13,
    transition: "background 0.15s",
  },
  error: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12,
    marginBottom: 16,
  },
  success: {
    background: "#d1fae5",
    color: "#065f46",
    border: "1px solid #a7f3d0",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 12,
    marginBottom: 16,
  },
};

