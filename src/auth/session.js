import {
  canonicalDepartmentValue,
  canonicalSchoolValue,
  isCisrSchool,
  isSoemrSchool,
} from "../constants/universityHierarchy";
import { NON_TEACHING_ROLES, isNonTeachingRole } from "../constants/nonTeachingHierarchy";
import { departmentHasHod } from "../utils/hierarchy";

export const VALID_ROLES = ["faculty", "hod", "center_head", "director", "dean", "vc", ...NON_TEACHING_ROLES];

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
  staff: "non_teaching_staff",
  "non teaching staff": "non_teaching_staff",
  "non-teaching staff": "non_teaching_staff",
  non_teaching_staff: "non_teaching_staff",
  "reporting officer": "reporting_officer",
  "reporting-officer": "reporting_officer",
  reporting_officer: "reporting_officer",
  "reporting head": "reporting_officer",
  registrar: "registrar",
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
  const role = normalizeRole(formData.role);
  const nonTeachingRole = isNonTeachingRole(role);
  const school = nonTeachingRole ? "" : canonicalSchoolValue(formData.school);
  const department = nonTeachingRole
    ? String(formData.department || "").trim()
    : isSoemrSchool(school)
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
    appraisal_role: role,
  };
};

export const storeUserSession = ({ token, profile = {}, fallbackEmail = "" }) => {
  const safeProfile = profile || {};
  const email = firstValue(safeProfile.email, fallbackEmail).toLowerCase();
  const name = firstValue(safeProfile.full_name, email);
  const role = normalizeRole(firstValue(safeProfile.appraisal_role, safeProfile.role));
  const nonTeachingRole = isNonTeachingRole(role);
  const school = nonTeachingRole ? "" : canonicalSchoolValue(firstValue(safeProfile.school));
  const department = nonTeachingRole
    ? firstValue(safeProfile.department)
    : isSoemrSchool(school)
      ? canonicalDepartmentValue(firstValue(safeProfile.department))
      : firstValue(safeProfile.department);
  const normalizedDepartment = nonTeachingRole || !isCisrSchool(school) ? department : "";

  if (token) {
    sessionStorage.setItem("accessToken", token);
  }

  sessionStorage.setItem("role", role);
  sessionStorage.setItem("username", email);
  sessionStorage.setItem("name", name);
  sessionStorage.setItem("department", normalizedDepartment);
  sessionStorage.setItem("school", school);
  sessionStorage.setItem("employeeId", firstValue(safeProfile.employee_id));
  sessionStorage.setItem("designation", firstValue(safeProfile.designation));
  sessionStorage.setItem("qualification", firstValue(safeProfile.qualification));
  sessionStorage.setItem("experience", firstValue(safeProfile.teaching_experience));
  sessionStorage.setItem("phone", firstValue(safeProfile.phone));

  const hasHod = departmentHasHod(school, normalizedDepartment);
  sessionStorage.setItem("hasHod", hasHod ? "true" : "false");
  sessionStorage.setItem("hasHOD", hasHod ? "true" : "false");

  return { email, role, school, department: normalizedDepartment };
};

