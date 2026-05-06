import {
  canonicalDepartmentValue,
  canonicalSchoolValue,
  isCisrSchool,
  isSoemrSchool,
} from "../constants/universityHierarchy";
import { departmentHasHod } from "../utils/hierarchy";

export const VALID_ROLES = ["faculty", "hod", "center_head", "director", "dean", "vc"];

const ROLE_ALIASES = {
  faculty: "faculty",
  hod: "hod",
  "head of department": "hod",
  center_head: "center_head",
  "center head": "center_head",
  "centre head": "center_head",
  "cisr center head": "center_head",
  "cisr centre head": "center_head",
  director: "director",
  dean: "dean",
  vc: "vc",
  "vice chancellor": "vc",
  "vice-chancellor": "vc",
  "vice_chancellor": "vc",
  "vice chancelor": "vc",
  "vice-chancelor": "vc",
  "vice_chancelor": "vc",
};

export const normalizeRole = (role, fallback = "faculty") => {
  const key = String(role || "").trim().toLowerCase();
  if (!key) return fallback;
  return ROLE_ALIASES[key] || fallback;
};

export const hasValidRole = (role) => VALID_ROLES.includes(normalizeRole(role, ""));

export const schoolHasHod = (school) => {
  if (!school) return false;
  return isSoemrSchool(school);
};

const firstValue = (...values) =>
  values.find((value) => String(value ?? "").trim() !== "") || "";

export const buildProfilePayload = (formData, academicYear = "2025-2026") => {
  const school = canonicalSchoolValue(formData.school);
  const department = isSoemrSchool(school)
    ? canonicalDepartmentValue(formData.department)
    : "";

  return {
    email: String(formData.email || "").trim().toLowerCase(),
    employee_id: String(formData.employeeId || "").trim() || null,
    full_name: String(formData.name || "").trim(),
    qualification: String(formData.qualification || "").trim() || null,
    designation: String(formData.designation || "").trim() || null,
    department: department || null,
    school: school || null,
    teaching_experience: String(formData.experience || "").trim() || null,
    phone: String(formData.phone || "").trim() || null,
    academic_year: academicYear,
    appraisal_role: normalizeRole(formData.role),
  };
};

export const storeUserSession = ({ session, user, profile = {}, fallbackEmail = "" }) => {
  const safeProfile = profile || {};
  const metadata = user?.user_metadata || {};
  const email = firstValue(safeProfile.email, user?.email, fallbackEmail).toLowerCase();
  const name = firstValue(safeProfile.full_name, metadata.name, metadata.full_name, email);
  const role = normalizeRole(firstValue(safeProfile.appraisal_role, metadata.role));
  const school = canonicalSchoolValue(firstValue(safeProfile.school, metadata.school));
  const department = isSoemrSchool(school)
    ? canonicalDepartmentValue(firstValue(safeProfile.department, metadata.department))
    : firstValue(safeProfile.department, metadata.department);
  const normalizedDepartment = isCisrSchool(school) ? "" : department;

  if (session?.access_token) {
    localStorage.setItem("supabaseToken", session.access_token);
  }

  localStorage.setItem("role", role);
  localStorage.setItem("username", email);
  localStorage.setItem("name", name);
  localStorage.setItem("department", normalizedDepartment);
  localStorage.setItem("school", school);
  localStorage.setItem("employeeId", firstValue(safeProfile.employee_id, metadata.employeeId, metadata.employee_id));
  localStorage.setItem("designation", firstValue(safeProfile.designation, metadata.designation));
  localStorage.setItem("qualification", firstValue(safeProfile.qualification, metadata.qualification));
  localStorage.setItem("experience", firstValue(safeProfile.teaching_experience, metadata.experience, metadata.teaching_experience));
  localStorage.setItem("phone", firstValue(safeProfile.phone, metadata.phone));

  const hasHod = departmentHasHod(school, normalizedDepartment);
  localStorage.setItem("hasHod", hasHod ? "true" : "false");
  localStorage.setItem("hasHOD", hasHod ? "true" : "false");

  return { email, role, school, department: normalizedDepartment };
};
