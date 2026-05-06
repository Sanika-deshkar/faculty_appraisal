import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import FacultyProfile from "./pages/FacultyProfile";
import EditProfile from "./pages/EditProfile";
import ProtectedRoute from "./auth/ProtectedRoute";
import RoleDashboard from "./pages/RoleDashboard";
import { useNavigate } from "react-router-dom";
import { normalizeRole } from "./auth/session";
import { SOEMR_DEPARTMENTS, UNIVERSITY_SCHOOLS } from "./constants/universityHierarchy";

const schoolLabel = (code) => UNIVERSITY_SCHOOLS.find((school) => school.code === code)?.label || "";

// ─── Mock users (replace with API later) ─────────────────────────────────────
const MOCK_USERS = {
  faculty: {
    employeeId: "EMP-2025-001",
    name: "Dr. Priya Sharma",
    designation: "Assistant Professor",
    department: SOEMR_DEPARTMENTS[0],
    school: schoolLabel("SoEMR"),
    role: "faculty",
    avatar: "PS",
  },
  hod: {
    employeeId: "EMP-2025-010",
    name: "Prof. Rajesh Kulkarni",
    designation: "Professor & Head",
    department: SOEMR_DEPARTMENTS[0],
    school: schoolLabel("SoEMR"),
    role: "hod",
    avatar: "RK",
  },
  center_head: {
    employeeId: "EMP-2025-040",
    name: "Dr. CISR Center Head",
    designation: "Center Head",
    department: "",
    school: schoolLabel("CISR"),
    role: "center_head",
    avatar: "CH",
  },
  dean: {
    employeeId: "EMP-2025-020",
    name: "Prof. Suresh Patil",
    designation: "Dean",
    department: "Engineering",
    school: schoolLabel("SoCSEA"),
    role: "dean",
    avatar: "SP",
  },
  director: {
    employeeId: "EMP-2025-030",
    name: "Dr. Mehta",
    designation: "Director",
    department: "",
    school: schoolLabel("SoEMR"),
    role: "director",
    avatar: "DM",
  },
  vc: {
    employeeId: "EMP-2025-000",
    name: "Prof. Anil Deshmukh",
    designation: "Vice Chancellor",
    department: "Administration",
    school: "University",
    role: "vc",
    avatar: "AD",
  },
  registrar: {
    employeeId: "EMP-2025-050",
    name: "Dr. Test Registrar",
    designation: "Registrar",
    department: "Office of the Registrar",
    school: "",
    role: "registrar",
    avatar: "TR",
  },
  reporting_officer: {
    employeeId: "EMP-2025-060",
    name: "Mr. Test Reporting Officer",
    designation: "Reporting Officer",
    department: "Administration",
    school: "",
    role: "reporting_officer",
    avatar: "RO",
  },
  non_teaching_staff: {
    employeeId: "EMP-2025-070",
    name: "Ms. Test Staff",
    designation: "Office Assistant",
    department: "Administration",
    school: "",
    role: "non_teaching_staff",
    avatar: "TS",
  },
};

// ─── Profile Loader ───────────────────────────────────────────────────────────
function ProfileLoader() {
  const navigate = useNavigate();
  const role = normalizeRole(sessionStorage.getItem("role"), "faculty");
  const name = sessionStorage.getItem("name") || "";
  const dept = sessionStorage.getItem("department") || "";
  const school = sessionStorage.getItem("school") || "";
  const empId = sessionStorage.getItem("employeeId") || "";
  const desig = sessionStorage.getItem("designation") || "";
  const qual = sessionStorage.getItem("qualification") || "";
  const exp = sessionStorage.getItem("experience") || "";
  const phone = sessionStorage.getItem("phone") || "";

  const baseUser = MOCK_USERS[role] || MOCK_USERS.faculty;
  const user = {
    ...baseUser,
    name: name || baseUser.name,
    department: dept || baseUser.department,
    school: school || baseUser.school,
    employeeId: empId || baseUser.employeeId,
    designation: desig || baseUser.designation,
    qualification: qual || (role === "faculty" ? "M.Tech, PhD" : "PhD"),
    experience: exp || "10 Years",
    phone: phone || "+91 98765 43210",
    avatar: (name || baseUser.name).split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase(),
    ay: "2025-2026",
  };

  return (
    <FacultyProfile
      user={user}
      onProceed={() => navigate("/dashboard")}
    />
  );
}

// ─── App Routes ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfileLoader />
            </ProtectedRoute>
          }
        />

        <Route
          path="/edit-profile"
          element={
            <ProtectedRoute>
              <EditProfile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <RoleDashboard />
            </ProtectedRoute>
          }
        />

        <Route path="/hod-dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dean-dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/director-dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/vc-dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/hoddashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/deandashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/directordashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/vcdashboard" element={<Navigate to="/dashboard" replace />} />

        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

