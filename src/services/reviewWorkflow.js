import { supabase } from "./supabase";
import { fetchSavedAppraisal, loadAppraisalSnapshot } from "./appraisalPersistence";
import {
  canAuthorityReviewProfile,
  getReviewChain,
  isRejectedStatus,
  pendingStatusFor,
  profileFromLocalStorage,
  reviewedStatusFor,
  roleLabel,
  normalizeRoleForWorkflow,
} from "../utils/hierarchy";

const n = (value) => parseFloat(value) || 0;
const dbNumber = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : n(text);
};
const requireSupabase = (error, action) => {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
};

const REVIEW_SECTION_TABLES = [
  ["lectures", "teaching_process"],
  ["courseFile", "course_files"],
  ["projects", "projects_guided"],
  ["quals", "qualification_enhancement"],
  ["feedback", "student_feedback"],
  ["deptActs", "department_activities"],
  ["uniActs", "university_activities"],
  ["society", "social_contributions"],
  ["industry", "industry_connect"],
  ["acr", "acr_scores"],
  ["journals", "journal_publications"],
  ["books", "book_publications"],
  ["ict", "ict_pedagogy"],
  ["research", "research_guidance"],
  ["projects2", "research_projects"],
  ["patents", "patents"],
  ["awards", "awards"],
  ["confs", "conferences"],
  ["proposals", "research_proposals"],
  ["fdps", "self_development"],
  ["training", "industrial_training"],
];

const REVIEW_SCORE_COLUMNS = {
  hod: "hod_score",
  center_head: "hod_score",
  director: "director_score",
  dean: "dean_score",
  vc: "vc_score",
};

const SNAPSHOT_REVIEW_ARRAY_KEYS = [
  "lectures",
  "courseFile",
  "projects",
  "quals",
  "feedback",
  "deptActs",
  "uniActs",
  "society",
  "industry",
  "acr",
  "journals",
  "popularWritings",
  "books",
  "ict",
  "research",
  "projects2",
  "internalProjects",
  "externalProjects",
  "ipr",
  "patents",
  "awards",
  "confs",
  "proposals",
  "products",
  "fdps",
  "training",
];

const INNOVATIVE_REVIEW_KEYS = {
  hod: "innovHod",
  center_head: "innovHod",
  director: "innovDirector",
  dean: "innovDean",
  vc: "innovVc",
};

const REVIEW_SCORE_FIELD_ALIASES = {
  hod: ["hod", "hodScore"],
  center_head: ["center_head", "centerHead", "hod", "hodScore"],
  director: ["director", "dir", "directorScore"],
  dean: ["dean", "deanScore"],
  vc: ["vc", "vcScore", "innovVC", "innovVc"],
};

const scoreValueForRole = (row, reviewerRole) => {
  const aliases = REVIEW_SCORE_FIELD_ALIASES[reviewerRole] || [reviewerRole];
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) {
      return row[key];
    }
  }
  return undefined;
};

const initialsFor = (name, fallback = "U") =>
  String(name || fallback)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const findProfileForEmail = (profiles, email) =>
  profiles.find((profile) => String(profile.email || "").toLowerCase() === String(email || "").toLowerCase());

const reviewKey = (email, academicYear, reviewerRole) =>
  `${String(email || "").toLowerCase()}::${academicYear}::${reviewerRole}`;

const getCurrentReviewer = (chain, reviewMap, email, academicYear) =>
  chain.find((role) => !reviewMap.has(reviewKey(email, academicYear, role))) || null;

const decorateStatusForViewer = ({ chain, reviewMap, email, academicYear, reviewerRole, declarationStatus }) => {
  const chainReviews = chain
    .map((role) => reviewMap.get(reviewKey(email, academicYear, role)))
    .filter(Boolean);
  const rejectedReview = chainReviews.find((review) => isRejectedStatus(review.status));
  const currentReviewer = getCurrentReviewer(chain, reviewMap, email, academicYear);
  const hasReviewerRecord = reviewMap.has(reviewKey(email, academicYear, reviewerRole));
  const reviewerRecord = reviewMap.get(reviewKey(email, academicYear, reviewerRole));

  if (isRejectedStatus(declarationStatus) || rejectedReview) {
    if (!hasReviewerRecord) {
      return {
        visible: false,
        reviewState: "waiting",
        status: "Waiting",
        workflowStatus: declarationStatus || rejectedReview?.status || "Rejected",
      };
    }

    return {
      visible: true,
      reviewState: isRejectedStatus(reviewerRecord?.status) ? "rejected" : "reviewed",
      status: isRejectedStatus(reviewerRecord?.status) ? "Rejected" : "Reviewed",
      workflowStatus: reviewerRecord?.status || declarationStatus || rejectedReview?.status,
    };
  }

  if (currentReviewer === reviewerRole) {
    return {
      visible: true,
      reviewState: "pending",
      status: "Pending Review",
      workflowStatus: pendingStatusFor(reviewerRole),
    };
  }

  if (hasReviewerRecord || (chain.includes(reviewerRole) && currentReviewer && chain.indexOf(reviewerRole) < chain.indexOf(currentReviewer))) {
    return {
      visible: true,
      reviewState: "reviewed",
      status: "Reviewed",
      workflowStatus: reviewedStatusFor(reviewerRole),
    };
  }

  if (!currentReviewer && chain.includes(reviewerRole)) {
    return {
      visible: true,
      reviewState: "reviewed",
      status: "Reviewed",
      workflowStatus: "VC Reviewed",
    };
  }

  return {
    visible: false,
    reviewState: "waiting",
    status: "Waiting",
    workflowStatus: currentReviewer ? pendingStatusFor(currentReviewer) : "Completed",
  };
};

const saveReviewerSectionScores = async ({
  subjectEmail,
  academicYear,
  reviewerRole,
  sectionScores,
}) => {
  const scoreColumn = REVIEW_SCORE_COLUMNS[reviewerRole];
  if (!scoreColumn || !sectionScores) return;

  for (const [sectionKey, tableName] of REVIEW_SECTION_TABLES) {
    const rows = Array.isArray(sectionScores[sectionKey]) ? sectionScores[sectionKey] : [];

    for (let index = 0; index < rows.length; index += 1) {
      const { error } = await supabase
        .from(tableName)
        .update({
          [scoreColumn]: dbNumber(scoreValueForRole(rows[index], reviewerRole)),
          updated_at: new Date().toISOString(),
        })
        .match({
          faculty_email: subjectEmail,
          academic_year: academicYear,
          row_no: index + 1,
        });

      requireSupabase(error, `Could not save ${reviewerRole} scores for ${tableName}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(sectionScores, "innovativeTeaching")) {
    const { error } = await supabase
      .from("innovative_teaching")
      .update({
        [scoreColumn]: dbNumber(scoreValueForRole(sectionScores.innovativeTeaching, reviewerRole)),
        updated_at: new Date().toISOString(),
      })
      .match({
        faculty_email: subjectEmail,
        academic_year: academicYear,
      });

    requireSupabase(error, `Could not save ${reviewerRole} innovative teaching score`);
  }
};

const saveReviewerScoresToSnapshot = async ({
  subjectEmail,
  academicYear,
  reviewerRole,
  sectionScores,
}) => {
  if (!sectionScores) return;

  const snapshotPayload = await loadAppraisalSnapshot({
    facultyEmail: subjectEmail,
    academicYear,
  });
  const currentForm = snapshotPayload?.form && typeof snapshotPayload.form === "object"
    ? snapshotPayload.form
    : {};
  const nextForm = { ...currentForm };

  SNAPSHOT_REVIEW_ARRAY_KEYS.forEach((key) => {
    if (!Array.isArray(sectionScores[key])) return;
    const existingRows = Array.isArray(nextForm[key]) ? nextForm[key] : [];
    nextForm[key] = sectionScores[key].map((row, index) => ({
      ...(existingRows[index] || {}),
      ...row,
      [reviewerRole]: scoreValueForRole(row, reviewerRole) ?? row?.[reviewerRole] ?? "",
    }));
  });

  const innovativeKey = INNOVATIVE_REVIEW_KEYS[reviewerRole];
  if (innovativeKey && Object.prototype.hasOwnProperty.call(sectionScores, "innovativeTeaching")) {
    nextForm[innovativeKey] = scoreValueForRole(sectionScores.innovativeTeaching, reviewerRole) ?? "";
  }

  const { error } = await supabase
    .from("appraisal_snapshots")
    .upsert({
      faculty_email: subjectEmail,
      academic_year: academicYear,
      payload: {
        ...(snapshotPayload || {}),
        form: nextForm,
        reviewedAt: new Date().toISOString(),
      },
    }, { onConflict: "faculty_email,academic_year" });

  requireSupabase(error, "Could not save reviewer scores to appraisal snapshot");
};

export const fetchReviewQueueForRole = async ({
  reviewerRole,
  reviewerProfile = profileFromLocalStorage(),
  academicYear,
  schoolValues = [],
} = {}) => {
  const role = normalizeRoleForWorkflow(reviewerRole || reviewerProfile.appraisal_role || reviewerProfile.role);
  if (!role || role === "faculty") return [];

  const scopedSchoolValues = [...new Set((schoolValues || []).filter(Boolean))];

  let profileQuery = supabase.from("faculty_profiles").select("*");
  if (scopedSchoolValues.length > 0) {
    profileQuery = profileQuery.in("school", scopedSchoolValues);
  }

  const { data: profiles, error: profilesError } = await profileQuery;
  if (profilesError) throw profilesError;

  if (scopedSchoolValues.length > 0 && !(profiles || []).length) {
    return [];
  }

  const scopedEmails = scopedSchoolValues.length > 0
    ? [...new Set((profiles || []).map((profile) => profile.email).filter(Boolean))]
    : [];
  if (scopedSchoolValues.length > 0 && scopedEmails.length === 0) {
    return [];
  }

  let declarationQuery = supabase
    .from("declarations")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (academicYear) {
    declarationQuery = declarationQuery.eq("academic_year", academicYear);
  }
  if (scopedEmails.length > 0) {
    declarationQuery = declarationQuery.in("faculty_email", scopedEmails);
  }

  let reviewsQuery = supabase.from("appraisal_reviews").select("*");
  if (scopedEmails.length > 0) {
    reviewsQuery = reviewsQuery.in("faculty_email", scopedEmails);
  }

  const [
    { data: declarations, error: declarationsError },
    { data: reviews, error: reviewsError },
  ] = await Promise.all([
    declarationQuery,
    reviewsQuery,
  ]);

  if (declarationsError) throw declarationsError;
  if (reviewsError) throw reviewsError;

  const reviewMap = new Map(
    (reviews || []).map((review) => [
      reviewKey(review.faculty_email, review.academic_year, review.reviewer_role),
      review,
    ])
  );

  const visibleDeclarations = (declarations || []).filter((declaration) => {
    const subjectProfile = findProfileForEmail(profiles || [], declaration.faculty_email) || {
      email: declaration.faculty_email,
      appraisal_role: "faculty",
    };
    const chain = getReviewChain(subjectProfile);
    if (!chain.includes(role)) return false;
    if (!canAuthorityReviewProfile({ ...reviewerProfile, appraisal_role: role }, subjectProfile)) return false;
    return decorateStatusForViewer({
      chain,
      reviewMap,
      email: declaration.faculty_email,
      academicYear: declaration.academic_year,
      reviewerRole: role,
      declarationStatus: declaration.status,
    }).visible;
  });

  const items = await Promise.all(visibleDeclarations.map(async (declaration) => {
    const subjectProfile = findProfileForEmail(profiles || [], declaration.faculty_email) || {
      email: declaration.faculty_email,
      full_name: declaration.faculty_email,
      appraisal_role: "faculty",
    };
    const chain = getReviewChain(subjectProfile);
    const viewerStatus = decorateStatusForViewer({
      chain,
      reviewMap,
      email: declaration.faculty_email,
      academicYear: declaration.academic_year,
      reviewerRole: role,
      declarationStatus: declaration.status,
    });
    const appraisal = await fetchSavedAppraisal({
      facultyEmail: declaration.faculty_email,
      academicYear: declaration.academic_year,
    });

    const hodReview =
      reviewMap.get(reviewKey(declaration.faculty_email, declaration.academic_year, "hod")) ||
      reviewMap.get(reviewKey(declaration.faculty_email, declaration.academic_year, "center_head"));
    const directorReview = reviewMap.get(reviewKey(declaration.faculty_email, declaration.academic_year, "director"));
    const deanReview = reviewMap.get(reviewKey(declaration.faculty_email, declaration.academic_year, "dean"));
    const vcReview = reviewMap.get(reviewKey(declaration.faculty_email, declaration.academic_year, "vc"));
    const appraisalRole = normalizeRoleForWorkflow(subjectProfile.appraisal_role);
    const name = subjectProfile.full_name || subjectProfile.email || declaration.faculty_email;

    return {
      ...appraisal,
      id: `${declaration.faculty_email}:${declaration.academic_year}`,
      email: declaration.faculty_email,
      faculty_email: declaration.faculty_email,
      academicYear: declaration.academic_year,
      name,
      employeeId: subjectProfile.employee_id || "",
      designation: subjectProfile.designation || roleLabel(appraisalRole),
      department: subjectProfile.department || "",
      school: subjectProfile.school || "",
      appraisalRole,
      submittedOn: declaration.submitted_at ? new Date(declaration.submitted_at).toLocaleDateString() : "",
      status: viewerStatus.status,
      workflowStatus: viewerStatus.workflowStatus,
      reviewState: viewerStatus.reviewState,
      avatar: initialsFor(name, declaration.faculty_email),
      avatarColor: appraisalRole === "hod" ? "#f59e0b" : appraisalRole === "director" ? "#3b82f6" : appraisalRole === "dean" ? "#8b5cf6" : "#6366f1",
      info: {
        ...appraisal.info,
        name,
        qual: subjectProfile.qualification || appraisal.info?.qual || "",
        desig: subjectProfile.designation || appraisal.info?.desig || roleLabel(appraisalRole),
        ay: declaration.academic_year,
      },
      hodTotal: n(hodReview?.total_score),
      hodPartA: n(hodReview?.part_a_score),
      hodPartB: n(hodReview?.part_b_score),
      hodRemarks: hodReview?.remarks || "",
      directorTotal: n(directorReview?.total_score),
      directorPartA: n(directorReview?.part_a_score),
      directorPartB: n(directorReview?.part_b_score),
      directorRemarks: directorReview?.remarks || "",
      deanTotal: n(deanReview?.total_score),
      deanPartA: n(deanReview?.part_a_score),
      deanPartB: n(deanReview?.part_b_score),
      deanRemarks: deanReview?.remarks || "",
      vcTotal: n(vcReview?.total_score),
      vcPartA: n(vcReview?.part_a_score),
      vcPartB: n(vcReview?.part_b_score),
      vcRemarks: vcReview?.remarks || "",
      declaration,
    };
  }));

  return items;
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
  const reviewerEmail = localStorage.getItem("username") || "";

  const { data: subjectProfile, error: profileError } = await supabase
    .from("faculty_profiles")
    .select("*")
    .eq("email", subjectEmail)
    .maybeSingle();

  if (profileError) throw profileError;

  const chain = getReviewChain(subjectProfile || { email: subjectEmail, appraisal_role: "faculty" });
  if (!chain.includes(role)) {
    throw new Error(`${roleLabel(role)} is not in the approval chain for this submission.`);
  }

  if (!canAuthorityReviewProfile({ ...profileFromLocalStorage(), appraisal_role: role }, subjectProfile || {})) {
    throw new Error(`${roleLabel(role)} is not authorized to review this submission.`);
  }

  const { data: existingReviews, error: existingReviewsError } = await supabase
    .from("appraisal_reviews")
    .select("*")
    .eq("faculty_email", subjectEmail)
    .eq("academic_year", academicYear);

  if (existingReviewsError) throw existingReviewsError;

  const existingReviewForRole = (existingReviews || []).find((review) => review.reviewer_role === role);
  const rejectedReview = (existingReviews || []).find((review) => isRejectedStatus(review.status));

  if (rejectedReview && rejectedReview.reviewer_role !== role) {
    throw new Error(`This submission was previously rejected by ${roleLabel(rejectedReview.reviewer_role)} and cannot continue in the locked workflow.`);
  }

  if (existingReviewForRole && isRejectedStatus(existingReviewForRole.status)) {
    throw new Error("This submission was previously rejected and cannot continue in the locked workflow.");
  }

  const reviewedRoles = new Set((existingReviews || []).map((review) => review.reviewer_role));
  const currentReviewer = chain.find((chainRole) => !reviewedRoles.has(chainRole));
  if (!existingReviewForRole && currentReviewer !== role) {
    throw new Error(currentReviewer
      ? `This submission is currently assigned to ${roleLabel(currentReviewer)}.`
      : "This submission has already completed the approval chain.");
  }

  const nextReviewer = chain[chain.indexOf(role) + 1];
  const nextStatus = nextReviewer ? pendingStatusFor(nextReviewer) : "VC Reviewed";

  await saveReviewerSectionScores({
    subjectEmail,
    academicYear,
    reviewerRole: role,
    sectionScores,
  });

  await saveReviewerScoresToSnapshot({
    subjectEmail,
    academicYear,
    reviewerRole: role,
    sectionScores,
  });

  const { error: reviewError } = await supabase
    .from("appraisal_reviews")
    .upsert({
      faculty_email: subjectEmail,
      academic_year: academicYear,
      reviewer_email: reviewerEmail,
      reviewer_role: role,
      part_a_score: n(partAScore),
      part_b_score: n(partBScore),
      total_score: n(totalScore),
      remarks,
      status: reviewedStatusFor(role),
      reviewed_at: new Date().toISOString(),
    }, { onConflict: "faculty_email,academic_year,reviewer_role" });

  if (reviewError) throw reviewError;

  const { error: declarationError } = await supabase
    .from("declarations")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .match({ faculty_email: subjectEmail, academic_year: academicYear });

  if (declarationError) throw declarationError;

  return { nextStatus };
};
