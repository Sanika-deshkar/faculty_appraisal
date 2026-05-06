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
import { supabase } from "../services/supabase";

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
        return {
          ...prev,
          school: value,
          role: "",
          department: "",
        };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const email = String(formData.email || "").trim().toLowerCase();
    const role = normalizeRole(formData.role, "");
    const nonTeaching = formData.staffType === "non_teaching";
    const selectedRoleIsNonTeaching = isNonTeachingRole(role);
    const school = canonicalSchoolValue(formData.school);
    const department = nonTeaching
      ? String(formData.department || "").trim()
      : isSoemrSchool(school)
        ? canonicalDepartmentValue(formData.department)
        : "";

    if (!email || !formData.role || (!nonTeaching && role !== "vc" && !school) || !formData.name.trim() || !formData.employeeId.trim() || !formData.designation.trim()) {
      setError(nonTeaching
        ? "Please fill in Role, Email, Full Name, Employee ID, Designation, and Department / Office."
        : "Please fill in School, Role, Email, Full Name, Employee ID, and Designation.");
      return;
    }

    if (!nonTeaching && selectedRoleIsNonTeaching) {
      setError("Please select a teaching role for this teaching profile.");
      return;
    }

    if (nonTeaching && !selectedRoleIsNonTeaching) {
      setError("Please select a non-teaching role for this non-teaching profile.");
      return;
    }

    if (!nonTeaching && role !== "vc" && !isValidSchool(school)) {
      setError("Please select one of the approved schools or centers from the dropdown.");
      return;
    }

    if (nonTeaching && !department) {
      setError("Please enter the department/office for non-teaching staff.");
      return;
    }

    if (isSoemrSchool(school) && (!department || !isValidSoemrDepartment(department))) {
      setError("Please select the correct SoEMR department from the dropdown.");
      return;
    }

    if (formData.role === "hod" && !isSoemrSchool(school)) {
      setError("HOD profiles must remain assigned to a SoEMR department in this hierarchy.");
      return;
    }

    if (formData.role === "center_head" && !isCisrSchool(school)) {
      setError("Center Head profiles must remain assigned to CISR.");
      return;
    }

    if (isCisrSchool(school) && (formData.role === "director" || formData.role === "dean" || formData.role === "hod")) {
      setError("CISR uses only Center Head and Faculty roles below VC.");
      return;
    }

    setSaving(true);
    try {
      const cleanFormData = {
        ...formData,
        email,
        role,
        school: nonTeaching ? "" : school,
        department,
      };
      const profilePayload = buildProfilePayload(cleanFormData, APP_INFO.DEFAULT_AY);
      const finalPayload = profilePayload;

      let savedProfile = finalPayload;
      const { data, error: profileError } = await supabase
        .from("faculty_profiles")
        .upsert(finalPayload, { onConflict: "email" })
        .select()
        .single();

      if (profileError) {
        console.warn("Could not update faculty profile in Supabase:", profileError.message);
      } else if (data) {
        savedProfile = data;
      }

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          name: cleanFormData.name.trim(),
          employeeId: cleanFormData.employeeId.trim(),
          designation: cleanFormData.designation.trim(),
          qualification: cleanFormData.qualification.trim(),
          experience: cleanFormData.experience.trim(),
          phone: cleanFormData.phone.trim(),
          school: cleanFormData.school,
          department: cleanFormData.department,
          role: cleanFormData.role,
        },
      });

      if (metadataError) {
        console.warn("Could not update auth metadata:", metadataError.message);
      }

      storeUserSession({
        profile: savedProfile,
        fallbackEmail: email,
      });

      setMessage("Profile updated successfully.");
      setTimeout(() => navigate("/dashboard", { replace: true }), 450);
    } catch (err) {
      console.error("Profile update error:", err);
      setError(err.message || "Unable to update profile. Please try again.");
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

          <div style={S.grid}>
            <Field label="Staff Type">
              <input style={{ ...S.input, background: "#f8fafc", color: "#64748b" }} value={STAFF_TYPE_LABEL[formData.staffType]} readOnly />
            </Field>

            <Field label="Role" required>
              <select style={S.input} name="role" value={formData.role} onChange={handleChange} required>
                <option value="">Select role</option>
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </Field>

            {!isNonTeaching && (
              <Field label="School" required={requiresSchool} wide>
                <select style={S.input} name="school" value={formData.school} onChange={handleChange} required={requiresSchool}>
                  <option value="">Select school</option>
                  {SCHOOL_OPTIONS.map((school) => (
                    <option key={school.value} value={school.value}>{school.label}</option>
                  ))}
                </select>
              </Field>
            )}

            {needsDepartment && (
              <Field label="SoEMR Department" required>
                <select style={S.input} name="department" value={formData.department} onChange={handleChange} required>
                  <option value="">Select department</option>
                  {SOEMR_DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </Field>
            )}

            {isNonTeaching && (
              <Field label="Department / Office" required>
                <input style={S.input} name="department" value={formData.department} onChange={handleChange} required />
              </Field>
            )}

            <Field label="Email" required>
              <input style={{ ...S.input, background: "#f8fafc", color: "#64748b" }} name="email" type="email" value={formData.email} readOnly required />
            </Field>

            <Field label="Full Name" required>
              <input style={S.input} name="name" value={formData.name} onChange={handleChange} required />
            </Field>
            <Field label="Employee ID" required>
              <input style={S.input} name="employeeId" value={formData.employeeId} onChange={handleChange} required />
            </Field>
            <Field label="Designation" required>
              <input style={S.input} name="designation" value={formData.designation} onChange={handleChange} required />
            </Field>
            <Field label="Qualification">
              <input style={S.input} name="qualification" value={formData.qualification} onChange={handleChange} />
            </Field>

            <Field label="Experience">
              <input style={S.input} name="experience" value={formData.experience} onChange={handleChange} />
            </Field>
            <Field label="Phone">
              <input style={S.input} name="phone" value={formData.phone} onChange={handleChange} />
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
    fontFamily: "Georgia, serif",
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
    fontFamily: "Georgia, serif",
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
    color: "#334155",
    fontSize: 12,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    color: "#0f172a",
    outline: "none",
    fontFamily: "Georgia, serif",
    background: "#fff",
    boxSizing: "border-box",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#475569",
    borderRadius: 8,
    padding: "10px 18px",
    cursor: "pointer",
    fontWeight: 700,
    fontFamily: "Georgia, serif",
  },
  saveBtn: {
    border: "none",
    background: "#0f172a",
    color: "#f8fafc",
    borderRadius: 8,
    padding: "10px 20px",
    cursor: "pointer",
    fontWeight: 700,
    fontFamily: "Georgia, serif",
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

