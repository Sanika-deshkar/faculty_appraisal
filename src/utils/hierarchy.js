import {
  DEAN_TRACKS,
  UNIVERSITY_SCHOOLS,
  canonicalDepartmentValue,
  getSchoolKey as getConfiguredSchoolKey,
  normalizeHierarchyText,
} from "../constants/universityHierarchy.js";
import { isNonTeachingRole, normalizeNonTeachingRole } from "../constants/nonTeachingHierarchy.js";

const ENGINEERING = DEAN_TRACKS.ENGINEERING;
const NON_ENGINEERING = DEAN_TRACKS.NON_ENGINEERING;
const DIRECT_VC = DEAN_TRACKS.DIRECT_VC;

export const SCHOOL_HIERARCHY = Object.fromEntries(
  UNIVERSITY_SCHOOLS.map((school) => [
    school.code,
    {
      name: school.name,
      label: school.label,
      deanTrack: school.deanTrack,
      directorLayer: true,
      hodDepartments: school.hodDepartments,
      aliases: school.aliases,
    },
  ])
);

const normalizeText = normalizeHierarchyText;

export const normalizeRoleForWorkflow = (role) => {
  const value = normalizeText(role);
  if (value === "admin" || value === "administrator") return "admin";
  if (value === "vice chancellor" || value === "vice chancelor" || value === "vc") return "vc";
  const nonTeachingRole = normalizeNonTeachingRole(value, "");
  if (nonTeachingRole) return nonTeachingRole;
  if (value === "center head" || value === "centre head" || value.includes("cisr center head") || value.includes("cisr centre head")) return "center_head";
  if (value.includes("dean")) return "dean";
  if (value.includes("director")) return "director";
  if (value === "hod" || value.includes("head of department")) return "hod";
  return "faculty";
};

export const getSchoolKey = getConfiguredSchoolKey;

export const getSchoolHierarchy = (school) => SCHOOL_HIERARCHY[getSchoolKey(school)] || null;

export const getDeanTrack = (profile = {}) => {
  const schoolConfig = getSchoolHierarchy(profile.school);
  if (schoolConfig?.deanTrack) return schoolConfig.deanTrack;

  const combined = normalizeText(`${profile.school || ""} ${profile.department || ""} ${profile.designation || ""}`);
  if (combined.includes("cisr") || combined.includes("interdisciplinary studies and research") || combined.includes("center head") || combined.includes("centre head")) {
    return DIRECT_VC;
  }
  if (combined.includes("non engineering") || combined.includes("commerce") || combined.includes("media") || combined.includes("design") || combined.includes("applied arts")) {
    return NON_ENGINEERING;
  }

  return ENGINEERING;
};

export const departmentHasHod = (school, department) => {
  const config = getSchoolHierarchy(school);
  if (!config?.hodDepartments?.length) return false;

  return Boolean(canonicalDepartmentValue(department));
};

export const getReviewChain = (profile = {}) => {
  const role = normalizeRoleForWorkflow(profile.appraisal_role || profile.role);

  if (role === "vc") return [];
  if (role === "registrar") return ["vc"];
  if (role === "reporting_officer") return ["registrar", "vc"];
  if (role === "non_teaching_staff") return ["reporting_officer", "registrar", "vc"];
  if (role === "center_head") return ["vc"];
  if (role === "dean") return ["vc"];
  if (role === "director") return ["dean", "vc"];
  if (role === "hod") return ["director", "dean", "vc"];

  if (getSchoolKey(profile.school) === "CISR") {
    return ["center_head", "vc"];
  }

  if (getSchoolKey(profile.school) === "SoEMR") {
    return ["hod", "director", "dean", "vc"];
  }

  return departmentHasHod(profile.school, profile.department)
    ? ["hod", "director", "dean", "vc"]
    : ["director", "dean", "vc"];
};

export const visiblePreviousReviewRoles = (reviewerRole, subjectProfile = {}) => {
  const role = normalizeRoleForWorkflow(reviewerRole);
  if (role === "admin") {
    return getSchoolKey(subjectProfile.school) === "CISR"
      ? ["center_head"]
      : ["hod", "director", "dean"];
  }
  if (role !== "vc") return [];

  const chain = getReviewChain(subjectProfile);
  const reviewerIndex = chain.indexOf(role);
  if (reviewerIndex < 0) return [];

  return chain.slice(0, reviewerIndex);
};

export const roleLabel = (role) => ({
  hod: "HOD",
  director: "Director",
  center_head: "Center Head",
  reporting_officer: "Reporting Officer",
  registrar: "Registrar",
  dean: "Dean",
  vc: "VC",
  non_teaching_staff: "Non-Teaching Staff",
  faculty: "Faculty",
}[role] || role);

export const pendingStatusFor = (role) => `Pending ${roleLabel(role)} Review`;
export const reviewedStatusFor = (role) => `${roleLabel(role)} Reviewed`;
export const rejectedStatusFor = (role) => `${roleLabel(role)} Rejected`;
export const isRejectedStatus = (status) => normalizeText(status).includes("rejected");
export const isAppraisalFinalisedByVc = (item = {}) => {
  const status = normalizeText(item?.declaration?.status || item?.declarationStatus || item?.declaration_status || "");
  return status === "reviewed";
};
export const reviewStatusForDecision = (role, decision = "approved") =>
  decision === "rejected" ? rejectedStatusFor(role) : reviewedStatusFor(role);

export const workflowValidationError = (profile = {}) => {
  const role = normalizeRoleForWorkflow(profile.appraisal_role || profile.role);
  const schoolKey = getSchoolKey(profile.school);

  if (isNonTeachingRole(role)) {
    return "";
  }

  if (role !== "vc" && role !== "dean" && !schoolKey) {
    return "Please select one of the approved schools or centers before submitting.";
  }

  if (role === "hod" && schoolKey !== "SoEMR") {
    return "HOD submissions are allowed only for SoEMR departments.";
  }

  if (role === "center_head" && schoolKey !== "CISR") {
    return "Center Head submissions are allowed only for CISR.";
  }

  if (schoolKey === "SoEMR" && (role === "faculty" || role === "hod") && !canonicalDepartmentValue(profile.department)) {
    return "Please select a valid SoEMR department before submitting.";
  }

  return "";
};

export const canAuthorityReviewProfile = (reviewerProfile = {}, subjectProfile = {}) => {
  const reviewerRole = normalizeRoleForWorkflow(reviewerProfile.appraisal_role || reviewerProfile.role);
  const subjectRole = normalizeRoleForWorkflow(subjectProfile.appraisal_role || subjectProfile.role);

  if (reviewerRole === "vc") return subjectRole !== "vc";

  if (reviewerRole === "registrar") {
    return subjectRole === "non_teaching_staff" || subjectRole === "reporting_officer";
  }

  if (reviewerRole === "reporting_officer") {
    return subjectRole === "non_teaching_staff";
  }

  if (isNonTeachingRole(reviewerRole) || isNonTeachingRole(subjectRole)) {
    return false;
  }

  if (reviewerRole === "dean") {
    const track = getDeanTrack(subjectProfile);
    return subjectRole !== "dean" &&
      track !== DIRECT_VC &&
      getDeanTrack(reviewerProfile) === track;
  }

  if (reviewerRole === "director") {
    return getSchoolKey(reviewerProfile.school) === getSchoolKey(subjectProfile.school) &&
      (subjectRole === "faculty" || subjectRole === "hod");
  }

  if (reviewerRole === "hod") {
    return subjectRole === "faculty" &&
      departmentHasHod(subjectProfile.school, subjectProfile.department) &&
      getSchoolKey(reviewerProfile.school) === getSchoolKey(subjectProfile.school) &&
      canonicalDepartmentValue(reviewerProfile.department) === canonicalDepartmentValue(subjectProfile.department);
  }

  if (reviewerRole === "center_head") {
    return subjectRole === "faculty" &&
      getSchoolKey(reviewerProfile.school) === "CISR" &&
      getSchoolKey(subjectProfile.school) === "CISR";
  }

  return false;
};

export const profileFromsessionStorage = () => ({
  email: sessionStorage.getItem("username") || "",
  full_name: sessionStorage.getItem("name") || "",
  appraisal_role: sessionStorage.getItem("role") || "",
  school: sessionStorage.getItem("school") || "",
  department: sessionStorage.getItem("department") || "",
  designation: sessionStorage.getItem("designation") || "",
  employee_id: sessionStorage.getItem("employeeId") || "",
});

