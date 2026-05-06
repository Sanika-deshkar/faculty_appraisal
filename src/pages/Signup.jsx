import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
import { supabase } from "../services/supabase";
import { buildProfilePayload, storeUserSession } from "../auth/session";

const BASE_ROLE_OPTIONS = [
  { value: "faculty", label: "Faculty" },
  { value: "hod", label: "HOD" },
  { value: "center_head", label: "Center Head" },
  { value: "dean", label: "Dean" },
  { value: "director", label: "Director" },
  { value: "vc", label: "Vice Chancellor" },
];

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
    employeeId: "",
    designation: "Assistant Professor",
    department: "",
    school: "",
    qualification: "",
    experience: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedSchool = canonicalSchoolValue(formData.school);
  const needsDepartment = isSoemrSchool(selectedSchool);
  const isCisr = isCisrSchool(selectedSchool);
  const roleOptions = BASE_ROLE_OPTIONS.filter((role) => {
    if (role.value === "hod") return needsDepartment;
    if (role.value === "center_head") return isCisr;
    if (isCisr && (role.value === "director" || role.value === "dean")) return false;
    return true;
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
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

  const handleSignup = async (e) => {
    e.preventDefault();
    const school = canonicalSchoolValue(formData.school);
    const department = canonicalDepartmentValue(formData.department);

    if (!formData.name || !formData.email || !formData.password || !formData.employeeId || !school || !formData.role) {
      setError("Please fill in all required fields (School, Role, Name, Email, Password, Employee ID).");
      return;
    }

    if (!isValidSchool(formData.school)) {
      setError("Please select one of the approved schools or centers from the dropdown.");
      return;
    }

    if (isSoemrSchool(school) && (!department || !isValidSoemrDepartment(department))) {
      setError("Please select the correct SoEMR department from the dropdown.");
      return;
    }

    if (formData.role === "hod" && !isSoemrSchool(school)) {
      setError("HOD accounts are allowed only for SoEMR departments in this hierarchy.");
      return;
    }

    if (formData.role === "center_head" && !isCisrSchool(school)) {
      setError("Center Head accounts are allowed only for CISR.");
      return;
    }

    if (isCisrSchool(school) && (formData.role === "director" || formData.role === "dean" || formData.role === "hod")) {
      setError("CISR uses only Center Head and Faculty roles below VC.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const cleanFormData = {
        ...formData,
        school,
        department: isSoemrSchool(school) ? department : "",
      };

      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanFormData.email.trim(),
        password: formData.password,
        options: {
          data: {
            name: cleanFormData.name,
            role: cleanFormData.role,
            employeeId: cleanFormData.employeeId,
            designation: cleanFormData.designation,
            department: cleanFormData.department,
            school: cleanFormData.school,
            qualification: cleanFormData.qualification,
            experience: cleanFormData.experience,
            phone: cleanFormData.phone,
          }
        }
      });

      if (authError) throw authError;

      const profilePayload = buildProfilePayload(cleanFormData, APP_INFO.DEFAULT_AY);
      const { data: profile, error: profileError } = await supabase
        .from("faculty_profiles")
        .upsert(profilePayload, { onConflict: "email" })
        .select()
        .single();

      if (profileError) throw profileError;

      storeUserSession({
        session: data?.session,
        user: data?.user,
        profile,
        fallbackEmail: cleanFormData.email,
      });

      navigate("/profile");

    } catch (err) {
      console.error("Signup error:", err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; }

  .dyp-input {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid rgba(255,255,255,0.55);
    border-radius: 4px;
    font-size: 13px;
    color: white;
    background: rgba(255,255,255,0.08);
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none;
  }
  .dyp-input::placeholder { color: rgba(255,255,255,0.5); }
  .dyp-input:focus {
    border-color: white;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.15);
  }
  .dyp-input option { background: #0f1932; color: white; }
  .dyp-btn {
    width: 100%;
    padding: 12px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.2s;
    letter-spacing: 0.2px;
  }
  .dyp-btn:hover:not(:disabled) { background: #1d4ed8; }
  .dyp-btn:disabled { opacity: 0.72; cursor: not-allowed; }
`}</style>

      <div style={s.wrap}>
        {/* Top Left Logo */}
        <img src="/image.png" alt="University Logo" style={s.topLeftLogo} />
        {/* Top Right Logo */}
        <img src="/IQAS.png" alt="IQAC Logo" style={s.topRightLogo} />

        <div style={s.overlay} />

        <div style={s.card}>

          {/* ════ Signup form ════ */}
          <div style={s.right}>
            <h2 style={s.panelTitle}>Create Account</h2>
            <p style={s.sub}>Fill in your details to get started</p>

            {error && <div style={s.error}>{error}</div>}

            <form onSubmit={handleSignup} style={s.formGrid}>
              <div style={{ ...s.inputGroup, gridColumn: "1 / -1" }}>
                <label style={s.label}>School *</label>
                <select className="dyp-input" name="school" value={formData.school} onChange={handleChange} required>
                  <option value="">Select school</option>
                  {SCHOOL_OPTIONS.map((school) => (
                    <option key={school.value} value={school.value}>{school.label}</option>
                  ))}
                </select>
              </div>

              <div style={s.inputGroup}>
                <label style={s.label}>Role *</label>
                <select className="dyp-input" name="role" value={formData.role} onChange={handleChange} required>
                  <option value="">Select role</option>
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>

              {needsDepartment && (
                <div style={s.inputGroup}>
                  <label style={s.label}>SoEMR Department *</label>
                  <select className="dyp-input" name="department" value={formData.department} onChange={handleChange} required>
                    <option value="">Select department</option>
                    {SOEMR_DEPARTMENTS.map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={s.inputGroup}>
                <label style={s.label}>Full Name *</label>
                <input className="dyp-input" type="text" name="name" value={formData.name} onChange={handleChange} required />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Email Address *</label>
                <input className="dyp-input" type="email" name="email" value={formData.email} onChange={handleChange} required />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Password *</label>
                <input className="dyp-input" type="password" name="password" value={formData.password} onChange={handleChange} required />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Employee ID *</label>
                <input className="dyp-input" type="text" name="employeeId" value={formData.employeeId} onChange={handleChange} required />
              </div>

              <div style={s.inputGroup}>
                <label style={s.label}>Designation</label>
                <input className="dyp-input" type="text" name="designation" placeholder="e.g. Assistant Professor" value={formData.designation} onChange={handleChange} />
              </div>

              <div style={s.inputGroup}>
                <label style={s.label}>Qualification</label>
                <input className="dyp-input" type="text" name="qualification" placeholder="e.g. Ph.D, M.Tech" value={formData.qualification} onChange={handleChange} />
              </div>

              <div style={s.inputGroup}>
                <label style={s.label}>Experience (Years)</label>
                <input className="dyp-input" type="text" name="experience" placeholder="e.g. 10 Years" value={formData.experience} onChange={handleChange} />
              </div>

              <div style={{ ...s.inputGroup, gridColumn: "1 / -1" }}>
                <label style={s.label}>Phone Number</label>
                <input className="dyp-input" type="text" name="phone" placeholder="e.g. +91 98765 43210" value={formData.phone} onChange={handleChange} />
              </div>

              <button
                type="submit"
                className="dyp-btn"
                style={{ gridColumn: "1 / -1", marginTop: 10, opacity: loading ? 0.72 : 1 }}
                disabled={loading}
              >
                {loading ? "Creating Account..." : "Sign Up"}
              </button>
            </form>

            <p style={s.loginText}>
              Already have an account?{" "}
              <Link to="/login" style={s.loginLink}>Log in</Link>
            </p>
          </div>

        </div>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  topLeftLogo: {
    position: "absolute",
    top: 20,
    left: 20,
    height: 100,
    zIndex: 2,
  },
  topRightLogo: {
    position: "absolute",
    top: 20,
    right: 20,
    height: 100,
    zIndex: 2,
  },
  wrap: {
    minHeight: "100vh",
    width: "100%",
    backgroundImage: "url('/dyp.jpeg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    position: "relative",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(8, 16, 38, 0.30)",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    zIndex: 1,
    width: "55%",
    maxWidth: 700,
    display: "flex",
    alignItems: "stretch",
    borderRadius: 8,
    background: "rgba(15, 25, 50, 0.72)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    overflow: "hidden",
  },
  left: {
    flex: 1,
    color: "white",
    padding: "32px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    justifyContent: "center",
  },
  uniName: {
    fontSize: 26,
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.3,
    color: "white",
  },
  desc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.8,
    margin: 0,
    maxWidth: 420,
  },
  right: {
    flex: 1,
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "white",
    marginBottom: 4,
    marginTop: 0,
  },
  sub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    margin: "0 0 20px",
  },
  error: {
    background: "rgba(185,28,28,0.25)",
    border: "1px solid rgba(252,165,165,0.5)",
    color: "#fca5a5",
    padding: "9px 12px",
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 1.5,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px 16px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  loginText: {
    marginTop: 18,
    textAlign: "center",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
  },
  loginLink: {
    color: "#60a5fa",
    fontWeight: 600,
    textDecoration: "none",
  },
};
