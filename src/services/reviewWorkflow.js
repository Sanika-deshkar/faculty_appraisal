import { api } from "./api";
import {
  canAuthorityReviewProfile,
  getReviewChain,
  isRejectedStatus,
  pendingStatusFor,
  profileFromsessionStorage,
  reviewedStatusFor,
  roleLabel,
  normalizeRoleForWorkflow,
} from "../utils/hierarchy";

const n = (value) => parseFloat(value) || 0;

const initialsFor = (name, fallback = "U") =>
  String(name || fallback)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const fetchReviewQueueForRole = async ({
  reviewerRole,
  reviewerProfile = profileFromsessionStorage(),
  academicYear,
  schoolValues = [],
} = {}) => {
  const role = normalizeRoleForWorkflow(reviewerRole || reviewerProfile.appraisal_role || reviewerProfile.role);
  if (!role || role === "faculty") return [];

  try {
    const params = {};
    if (academicYear) params.academic_year = academicYear;
    if (schoolValues?.length) params.schools = schoolValues.join(",");

    const items = await api.get("/dashboard/subordinates", { params });
    return (items || []).map((item) => ({
      ...item,
      avatar: initialsFor(item.name || item.email, item.email),
      avatarColor:
        item.appraisalRole === "hod" ? "#f59e0b"
        : item.appraisalRole === "director" ? "#3b82f6"
        : item.appraisalRole === "dean" ? "#8b5cf6"
        : "#6366f1",
      hodTotal: n(item.hodTotal),
      hodPartA: n(item.hodPartA),
      hodPartB: n(item.hodPartB),
      hodRemarks: item.hodRemarks || "",
      directorTotal: n(item.directorTotal),
      directorPartA: n(item.directorPartA),
      directorPartB: n(item.directorPartB),
      directorRemarks: item.directorRemarks || "",
      deanTotal: n(item.deanTotal),
      deanPartA: n(item.deanPartA),
      deanPartB: n(item.deanPartB),
      deanRemarks: item.deanRemarks || "",
      vcTotal: n(item.vcTotal),
      vcPartA: n(item.vcPartA),
      vcPartB: n(item.vcPartB),
      vcRemarks: item.vcRemarks || "",
    }));
  } catch (err) {
    throw new Error(err?.message || "Could not load review queue.");
  }
};

export const submitWorkflowReview = async ({
  subjectEmail,
  academicYear,
  reviewerRole,
  partAScore = 0,
  partBScore = 0,
  totalScore = 0,
  remarks = "",
  sectionScores,
}) => {
  const role = normalizeRoleForWorkflow(reviewerRole);

  const endpointMap = {
    hod: "hod",
    center_head: "center-head",
    director: "director",
    dean: "dean",
    vc: "final",
  };

  const endpoint = endpointMap[role];
  if (!endpoint) {
    throw new Error(`Unknown reviewer role: ${role}`);
  }

  const result = await api.put(
    `/appraisal-remarks/${endpoint}/${encodeURIComponent(subjectEmail)}`,
    {
      academic_year: academicYear,
      remarks,
      part_a_score: n(partAScore),
      part_b_score: n(partBScore),
      total_score: n(totalScore),
      section_scores: sectionScores || {},
    }
  );

  return result || {};
};
