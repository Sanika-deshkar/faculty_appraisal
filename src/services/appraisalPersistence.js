import { api } from "./api";
import { storeUserSession } from "../auth/session";
import { getDeanTrack, getReviewChain, normalizeRoleForWorkflow, pendingStatusFor } from "../utils/hierarchy";
import { DEAN_TRACKS } from "../constants/universityHierarchy";

const SNAPSHOT_SETTERS = {
  info: "setInfo",
  lectures: "setLectures",
  courseFile: "setCourseFile",
  innovRows: "setInnovRows",
  innovDetails: "setInnovDetails",
  innovScore: "setInnovScore",
  innovHod: "setInnovHod",
  innovDirector: "setInnovDirector",
  innovDean: "setInnovDean",
  innovVc: "setInnovVc",
  projects: "setProjects",
  quals: "setQuals",
  feedback: "setFeedback",
  deptActs: "setDeptActs",
  uniActs: "setUniActs",
  society: "setSociety",
  industry: "setIndustry",
  acr: "setAcr",
  journals: "setJournals",
  popularWritings: "setPopularWritings",
  books: "setBooks",
  ict: "setIct",
  research: "setResearch",
  projects2: "setProjects2",
  internalProjects: "setInternalProjects",
  externalProjects: "setExternalProjects",
  ipr: "setIpr",
  patents: "setPatents",
  awards: "setAwards",
  confs: "setConfs",
  proposals: "setProposals",
  products: "setProducts",
  fdps: "setFdps",
  training: "setTraining",
};

const snapshotFormFromPayload = (payload) => {
  if (!payload) return null;
  if (payload.form && typeof payload.form === "object") return payload.form;
  if (payload.data && typeof payload.data === "object") return payload.data;
  return null;
};

const applySnapshotToSetters = (snapshotPayload, setters) => {
  const snapshotForm = snapshotFormFromPayload(snapshotPayload);
  if (!snapshotForm || !setters) return;

  Object.entries(SNAPSHOT_SETTERS).forEach(([formKey, setterKey]) => {
    if (Object.prototype.hasOwnProperty.call(snapshotForm, formKey)) {
      setters[setterKey]?.(snapshotForm[formKey]);
    }
  });

  if (snapshotPayload?.docs) {
    setters.setDocs?.(snapshotPayload.docs);
  }
};

export const loadAppraisalSnapshot = async ({ facultyEmail, academicYear }) => {
  if (!facultyEmail || !academicYear) return null;
  try {
    const data = await api.get("/appraisal/snapshot", {
      params: { academic_year: academicYear },
    });
    return data?.payload ?? data ?? null;
  } catch {
    return null;
  }
};

export const saveAppraisalDraftSection = async ({
  facultyEmail,
  academicYear,
  form,
  docs = {},
  totals = {},
  submitterProfile,
  sectionSaveStatus = {},
}) => {
  if (!facultyEmail) throw new Error("Please login again before saving. Your email was not found in this session.");
  if (!academicYear) throw new Error("Academic year is required before saving.");

  await api.put("/appraisal/snapshot", {
    academic_year: academicYear,
    payload: {
      form: { ...form, sectionSaveStatus },
      totals,
      docs,
      submitterProfile,
      savedAt: new Date().toISOString(),
    },
  });
};

export const docsToRows = (docs, facultyEmail, academicYear) => {
  const docSectionFromKey = (docKey) => docKey.replace(/-\d+$/, "").replace(/\d+$/, "");
  const docRowFromKey = (docKey) => {
    const match = docKey.match(/(\d+)$/);
    return match ? Number(match[1]) + 1 : null;
  };

  return Object.entries(docs || {}).flatMap(([docKey, files]) =>
    (files || []).slice(0, 1)
      .filter((file) => file?.url && !String(file.url).startsWith("blob:"))
      .map((file) => ({
        faculty_email: facultyEmail,
        academic_year: academicYear,
        section: docSectionFromKey(docKey),
        row_no: docRowFromKey(docKey),
        doc_key: docKey,
        file_name: file.name,
        file_type: file.type,
        file_url: file.url,
        storage_path: file.publicId || null,
      }))
  );
};

export const loadAppraisalDocuments = async ({ facultyEmail, academicYear, setDocs }) => {
  if (!facultyEmail || !academicYear || !setDocs) return;

  try {
    const data = await api.get("/appraisal-documents", {
      params: { academic_year: academicYear },
    });

    const groupedDocs = {};
    (data || []).forEach((row) => {
      const key = row.doc_key || `${row.section}-${Math.max((row.row_no || 1) - 1, 0)}`;
      if (groupedDocs[key]?.length) return;
      groupedDocs[key] = [{
        name: row.file_name,
        type: row.file_type,
        url: row.file_url,
        publicId: row.storage_path,
      }];
    });

    setDocs(groupedDocs);
  } catch {
    // non-fatal
  }
};

export const loadSavedAppraisal = async ({ facultyEmail, academicYear, setters }) => {
  if (!facultyEmail || !academicYear || !setters) return;

  const snapshotPayload = await loadAppraisalSnapshot({ facultyEmail, academicYear });
  if (snapshotPayload) {
    applySnapshotToSetters(snapshotPayload, setters);
  }
};

// Used by reviewWorkflow to load any faculty's appraisal for authority review.
export const fetchSavedAppraisal = async ({ facultyEmail, academicYear }) => {
  if (!facultyEmail) throw new Error("Faculty email is required to open the submitted form.");
  if (!academicYear) throw new Error("Academic year is required to open the submitted form.");
  try {
    const data = await api.get(
      `/dashboard/faculty/${encodeURIComponent(facultyEmail)}`,
      { params: { academic_year: academicYear } }
    );
    return readSubmittedAppraisalResponse(data, facultyEmail, academicYear);
  } catch (err) {
    if (err?.statusCode === 403) {
      const repaired = await repairDeanDivisionProfile();
      if (repaired) {
        try {
          const data = await api.get(
            `/dashboard/faculty/${encodeURIComponent(facultyEmail)}`,
            { params: { academic_year: academicYear } }
          );
          return readSubmittedAppraisalResponse(data, facultyEmail, academicYear);
        } catch {
          // Fall through to the explicit authority message below.
        }
      }
      throw new Error("Access denied while opening this submitted form. I tried the Dean division-profile repair, but the backend still rejected the request. Please log out and log in again so the refreshed profile/token is used. If it still fails, the backend faculty_profiles.school for this Dean must be updated to 'engineering' or 'non_engineering'.", { cause: err });
    }
    throw err;
  }
};

const readSubmittedAppraisalResponse = (data, facultyEmail, academicYear) => {
  if (!data) {
    throw new Error(`No saved appraisal snapshot was found for ${facultyEmail} in academic year ${academicYear}. Check that the academic year matches the submitted record.`);
  }
  const normalized = normalizeFetchedAppraisal(data);
  const form = normalized.payload?.form || normalized.form;
  if (!hasSubmittedFormData(form)) {
    throw new Error(`The saved appraisal snapshot for ${facultyEmail} does not contain submitted form section data. The user may need to resubmit the appraisal for academic year ${academicYear}.`);
  }
  return normalized;
};

const repairDeanDivisionProfile = async () => {
  const role = normalizeRoleForWorkflow(sessionStorage.getItem("role"));
  if (role !== "dean") return false;

  const profile = {
    school: sessionStorage.getItem("school") || "",
    department: sessionStorage.getItem("department") || "",
    designation: sessionStorage.getItem("designation") || "",
  };
  if (!profile.school) return false;
  const deanTrack = getDeanTrack(profile);
  if (![DEAN_TRACKS.ENGINEERING, DEAN_TRACKS.NON_ENGINEERING].includes(deanTrack)) return false;

  try {
    await api.put("/auth/me", { school: deanTrack });
    const refreshedProfile = await api.get("/auth/me").catch(() => null);
    if (refreshedProfile) {
      storeUserSession({ profile: refreshedProfile });
    }
    sessionStorage.setItem("school", deanTrack);
    sessionStorage.setItem("hasHod", "false");
    sessionStorage.setItem("hasHOD", "false");
    return true;
  } catch {
    return false;
  }
};

const FORM_SECTION_KEYS = [
  "lectures", "courseFile", "projects", "quals", "feedback", "deptActs", "uniActs",
  "society", "industry", "acr", "journals", "books", "ict", "research", "projects2",
  "internalProjects", "externalProjects", "ipr", "patents", "awards", "confs",
  "proposals", "products", "fdps", "training", "popularWritings",
];

const REVIEW_FIELD_BY_ROLE = {
  hod: "hod",
  center_head: "hod",
  director: "director",
  dean: "dean",
  vc: "vc",
};

const REVIEW_INNOV_FIELD_BY_ROLE = {
  hod: "innovHod",
  center_head: "innovHod",
  director: "innovDirector",
  dean: "innovDean",
  vc: "innovVc",
};

const hasSubmittedFormData = (form = {}) =>
  Boolean(form && FORM_SECTION_KEYS.some((key) => Array.isArray(form[key]) && form[key].length > 0));

const firstPresent = (...values) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");

const parseMaybeJson = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const reviewArrayFrom = (value) => {
  const parsed = parseMaybeJson(value);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed.map(parseMaybeJson);
  if (typeof parsed !== "object") return [];

  return Object.entries(parsed).map(([role, review]) => {
    const parsedReview = parseMaybeJson(review);
    if (parsedReview && typeof parsedReview === "object" && !Array.isArray(parsedReview)) {
      return { reviewer_role: parsedReview.reviewer_role || parsedReview.reviewerRole || role, ...parsedReview };
    }
    return { reviewer_role: role, section_scores: parsedReview };
  });
};

const syntheticReviewFromRoleFields = (source = {}) =>
  ["hod", "center_head", "director", "dean", "vc"].flatMap((role) => {
    const camel = role.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const sectionScores = parseMaybeJson(
      source[`${role}_section_scores`] ||
      source[`${role}_sectionScores`] ||
      source[`${role}_scores`] ||
      source[`${role}_review_scores`] ||
      source[`${camel}SectionScores`] ||
      source[`${camel}Scores`] ||
      source[`${camel}ReviewScores`],
    );
    if (!sectionScores) return [];
    return [{
      reviewer_role: role,
      section_scores: sectionScores,
      part_a_score: source[`${role}_part_a`] || source[`${camel}PartA`],
      part_b_score: source[`${role}_part_b`] || source[`${camel}PartB`],
      total_score: source[`${role}_total`] || source[`${camel}Total`],
      remarks: source[`${role}_remarks`] || source[`${camel}Remarks`],
    }];
  });

const reviewsFromRoleScoreMap = (source = {}) => {
  const explicitMap = parseMaybeJson(
    source.section_scores_by_role ||
    source.sectionScoresByRole ||
    source.review_scores_by_role ||
    source.reviewScoresByRole ||
    source.reviewer_scores ||
    source.reviewerScores ||
    source.role_scores ||
    source.roleScores,
  );
  const directSectionScores = parseMaybeJson(source.section_scores || source.sectionScores);
  const roleWrappedSectionScores =
    directSectionScores &&
    typeof directSectionScores === "object" &&
    !Array.isArray(directSectionScores) &&
    ["hod", "center_head", "director", "dean", "vc"].some((role) => directSectionScores[role])
      ? directSectionScores
      : null;
  const scoreMap = explicitMap || roleWrappedSectionScores;

  if (!scoreMap || typeof scoreMap !== "object" || Array.isArray(scoreMap)) return [];

  return Object.entries(scoreMap).map(([role, sectionScores]) => ({
    reviewer_role: role,
    section_scores: sectionScores,
  }));
};

const reviewsFromAppraisalResponse = (data = {}) => [
  ...reviewArrayFrom(data.reviews),
  ...reviewArrayFrom(data.review_history),
  ...reviewArrayFrom(data.reviewHistory),
  ...reviewArrayFrom(data.appraisal_reviews),
  ...reviewArrayFrom(data.appraisalReviews),
  ...reviewArrayFrom(data.payload?.reviews),
  ...reviewArrayFrom(data.payload?.review_history),
  ...reviewArrayFrom(data.payload?.reviewHistory),
  ...reviewArrayFrom(data.payload?.appraisal_reviews),
  ...reviewArrayFrom(data.payload?.appraisalReviews),
  ...reviewsFromRoleScoreMap(data),
  ...reviewsFromRoleScoreMap(data.payload || {}),
  ...syntheticReviewFromRoleFields(data),
  ...syntheticReviewFromRoleFields(data.payload || {}),
];

const reviewRowScore = (row, roleField, role) => {
  const parsedRow = parseMaybeJson(row);
  if (parsedRow === undefined || parsedRow === null) return undefined;
  if (typeof parsedRow !== "object" || Array.isArray(parsedRow)) return parsedRow;
  return firstPresent(
    parsedRow[roleField],
    parsedRow[role],
    parsedRow[`${roleField}_score`],
    parsedRow[`${role}_score`],
    parsedRow[`${roleField}_marks`],
    parsedRow[`${role}_marks`],
    parsedRow.reviewScore,
    parsedRow.review_score,
    parsedRow.reviewerScore,
    parsedRow.reviewer_score,
    parsedRow.value,
    parsedRow.total,
  );
};

const mergeSectionReviewScore = (rows, sectionScore, roleField, role) => {
  const baseRows = Array.isArray(rows) ? rows : [];

  const parsedSectionScore = parseMaybeJson(sectionScore);

  if (Array.isArray(parsedSectionScore)) {
    const length = Math.max(baseRows.length, parsedSectionScore.length);
    return Array.from({ length }, (_, index) => {
      const existing = baseRows[index] || {};
      const reviewValue = reviewRowScore(parsedSectionScore[index], roleField, role);
      return reviewValue === undefined ? existing : { ...existing, [roleField]: reviewValue };
    });
  }

  if (parsedSectionScore && typeof parsedSectionScore === "object") {
    const numericEntries = Object.entries(parsedSectionScore)
      .filter(([key]) => /^\d+$/.test(key))
      .sort(([a], [b]) => Number(a) - Number(b));
    if (numericEntries.length) {
      return mergeSectionReviewScore(baseRows, numericEntries.map(([, value]) => value), roleField, role);
    }
  }

  const reviewValue = reviewRowScore(parsedSectionScore, roleField, role);
  if (reviewValue === undefined) return rows;
  if (!baseRows.length) return [{ [roleField]: reviewValue }];
  return baseRows.map((row, index) => index === 0 ? { ...row, [roleField]: reviewValue } : row);
};

const REVIEW_SECTION_KEY_ALIASES = {
  teaching_process: "lectures",
  teachingProcess: "lectures",
  lectures_tutorials_practicals: "lectures",
  lecturesTutorialsPracticals: "lectures",
  course_file: "courseFile",
  courseFiles: "courseFile",
  course_files: "courseFile",
  qualification_enhancement: "quals",
  qualificationEnhancement: "quals",
  qualifications: "quals",
  student_feedback: "feedback",
  studentFeedback: "feedback",
  departmental_activities: "deptActs",
  departmentalActivities: "deptActs",
  department_activities: "deptActs",
  departmentActivities: "deptActs",
  dept_acts: "deptActs",
  university_activities: "uniActs",
  universityActivities: "uniActs",
  uni_acts: "uniActs",
  contribution_to_society: "society",
  contributionToSociety: "society",
  industry_connect: "industry",
  industryConnect: "industry",
  annual_confidential_report: "acr",
  annualConfidentialReport: "acr",
  journal_publications: "journals",
  journalPublications: "journals",
  research_papers: "journals",
  researchPapers: "journals",
  research_papers_journal_publications: "journals",
  researchPapersJournalPublications: "journals",
  book_chapters: "books",
  bookChapters: "books",
  books_book_chapters: "books",
  booksBookChapters: "books",
  e_content: "ict",
  eContent: "ict",
  ict_e_content: "ict",
  ictEContent: "ict",
  research_guidance: "research",
  researchGuidance: "research",
  internal_projects: "projects2",
  internalProjects: "projects2",
  consultancy_internal_projects: "projects2",
  consultancyInternalProjects: "projects2",
  external_projects: "externalProjects",
  external_projects_consultancy: "externalProjects",
  externalProjectsConsultancy: "externalProjects",
  invited_lectures: "confs",
  invitedLectures: "confs",
  conferences: "confs",
  research_proposals: "proposals",
  researchProposals: "proposals",
  submitted_research_proposals: "proposals",
  submittedResearchProposals: "proposals",
  products_developed: "products",
  productsDeveloped: "products",
  fdp_workshops: "fdps",
  fdpWorkshops: "fdps",
  industrial_training: "training",
  industrialTraining: "training",
};

const normalizeReviewSectionScores = (scores = {}) => {
  const parsedScores = parseMaybeJson(scores);
  if (!parsedScores || typeof parsedScores !== "object" || Array.isArray(parsedScores)) return parsedScores;
  const normalized = { ...parsedScores };
  Object.entries(parsedScores).forEach(([key, value]) => {
    const target = REVIEW_SECTION_KEY_ALIASES[key];
    if (target && normalized[target] === undefined) normalized[target] = value;
  });
  return normalized;
};

const applyReviewToForm = (form = {}, review = {}) => {
  const role = normalizeRoleForWorkflow(review.reviewer_role || review.reviewerRole || review.role);
  const roleField = REVIEW_FIELD_BY_ROLE[role];
  if (!roleField) return form;

  const rawScores = parseMaybeJson(
    review.section_scores ||
    review.sectionScores ||
    review.review_scores ||
    review.reviewScores ||
    review.scores ||
    review,
  );
  const scores = normalizeReviewSectionScores(
    rawScores?.form ||
    rawScores?.payload?.form ||
    rawScores?.section_scores ||
    rawScores?.sectionScores ||
    rawScores,
  );
  if (!scores || typeof scores !== "object") return form;

  const next = { ...form };
  FORM_SECTION_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(scores, key)) return;
    next[key] = mergeSectionReviewScore(next[key], scores[key], roleField, role);
  });

  const innovField = REVIEW_INNOV_FIELD_BY_ROLE[role];
  const innovScore = firstPresent(
    reviewRowScore(scores.innovativeTeaching, roleField, role),
    scores[innovField],
    scores.innovative_teaching,
    scores.innovativeTeachingScore,
  );
  if (innovField && innovScore !== undefined) next[innovField] = innovScore;

  return next;
};

const mergeReviewScoresIntoForm = (form = {}, reviews = []) =>
  (reviews || []).reduce((current, review) => applyReviewToForm(current, review), form);

const aliasKeys = (rows, mapping) =>
  (rows || []).map((row) => {
    const out = { ...row };
    Object.entries(mapping).forEach(([from, to]) => {
      if (out[to] == null && out[from] != null) out[to] = out[from];
    });
    return out;
  });

const REVIEW_SCORE_ALIASES = {
  hod_score: "hod",
  hodScore: "hod",
  hod_marks: "hod",
  hodMarks: "hod",
  center_head_score: "hod",
  centerHeadScore: "hod",
  center_head_marks: "hod",
  centerHeadMarks: "hod",
  director_score: "director",
  directorScore: "director",
  director_marks: "director",
  directorMarks: "director",
  dean_score: "dean",
  deanScore: "dean",
  dean_marks: "dean",
  deanMarks: "dean",
  vc_score: "vc",
  vcScore: "vc",
  vc_marks: "vc",
  vcMarks: "vc",
};

const normalizeReviewScoreAliasesOnRows = (normalized) => {
  FORM_SECTION_KEYS.forEach((key) => {
    if (Array.isArray(normalized[key])) {
      normalized[key] = aliasKeys(normalized[key], REVIEW_SCORE_ALIASES);
    }
  });
  return normalized;
};

const normalizeInnovativeReviewScoreAliases = (normalized) => {
  const mapping = {
    innov_hod: "innovHod",
    innov_hod_score: "innovHod",
    innovHodScore: "innovHod",
    innov_center_head: "innovHod",
    innov_center_head_score: "innovHod",
    innovCenterHead: "innovHod",
    innovCenterHeadScore: "innovHod",
    innov_director: "innovDirector",
    innov_director_score: "innovDirector",
    innovDirectorScore: "innovDirector",
    innov_dean: "innovDean",
    innov_dean_score: "innovDean",
    innovDeanScore: "innovDean",
    innov_vc: "innovVc",
    innov_vc_score: "innovVc",
    innovVC: "innovVc",
    innovVcScore: "innovVc",
  };
  Object.entries(mapping).forEach(([from, to]) => {
    if (normalized[to] == null && normalized[from] != null) normalized[to] = normalized[from];
  });
  return normalized;
};

const normalizeFetchedForm = (form = {}) => {
  const normalized = { ...form };
  const lectures = normalized.lectures || normalized.teaching_process || normalized.teachingProcess;
  if (lectures) {
    normalized.lectures = aliasKeys(lectures, {
      semester: "sem",
      course_code: "code",
      courseCode: "code",
      planned_classes: "planned",
      plannedClasses: "planned",
      conducted_classes: "conducted",
      conductedClasses: "conducted",
    });
  }
  if (normalized.feedback) {
    normalized.feedback = aliasKeys(normalized.feedback, {
      course_code: "code",
      courseCode: "code",
      feedback_1: "fb1",
      feedback1: "fb1",
      feedback_2: "fb2",
      feedback2: "fb2",
    });
  }
  if (normalized.society) {
    normalized.society = aliasKeys(normalized.society, { activity: "label" });
  }
  const journals = normalized.journals ||
    normalized.journal_publications ||
    normalized.journalPublications ||
    normalized.research_papers ||
    normalized.researchPapers ||
    normalized.journal_publication ||
    normalized.journalPublication;
  if (journals) {
    normalized.journals = aliasKeys(journals, {
      indexing: "index",
      index_name: "index",
      indexName: "index",
      journal_name: "journal",
      journalName: "journal",
      paper_title: "title",
      paperTitle: "title",
      issn_no: "issn",
      issnNo: "issn",
      ...REVIEW_SCORE_ALIASES,
    });
  }
  if (normalized.books) {
    normalized.books = aliasKeys(normalized.books, {
      publisher: "pub",
      coauthor: "coauth",
      co_author: "coauth",
      first_author: "first",
      firstAuthor: "first",
    });
  }
  if (normalized.ict) {
    normalized.ict = aliasKeys(normalized.ict, {
      description: "desc",
      quadrant: "quad",
    });
  }
  if (normalized.research) {
    normalized.research = aliasKeys(normalized.research, {
      student_name: "name",
      studentName: "name",
    });
  }
  if (normalized.projects2) {
    normalized.projects2 = aliasKeys(normalized.projects2, {
      sanction_date: "date",
      sanctionDate: "date",
      project_status: "status",
      projectStatus: "status",
    });
  }
  if (normalized.externalProjects) {
    normalized.externalProjects = aliasKeys(normalized.externalProjects, {
      sanction_date: "date",
      sanctionDate: "date",
      project_status: "status",
      projectStatus: "status",
    });
  }
  if (normalized.patents) {
    normalized.patents = aliasKeys(normalized.patents, {
      patent_date: "date",
      patentDate: "date",
      patent_status: "status",
      patentStatus: "status",
      file_no: "fileNo",
      fileNo: "fileNo",
    });
  }
  if (normalized.awards) {
    normalized.awards = aliasKeys(normalized.awards, {
      award_date: "date",
      awardDate: "date",
    });
  }
  if (normalized.confs) {
    normalized.confs = aliasKeys(normalized.confs, { organization: "org" });
  }
  if (normalized.fdps) {
    normalized.fdps = aliasKeys(normalized.fdps, { organization: "org" });
  }
  return normalizeInnovativeReviewScoreAliases(normalizeReviewScoreAliasesOnRows(normalized));
};

const normalizeFetchedAppraisal = (data = {}) => {
  const reviews = reviewsFromAppraisalResponse(data);
  const payload = data.payload ? { ...data.payload } : null;
  const payloadForm = payload?.form ? mergeReviewScoresIntoForm(normalizeFetchedForm(payload.form), reviews) : null;
  const directForm = data.form ? mergeReviewScoresIntoForm(normalizeFetchedForm(data.form), reviews) : null;
  const directData = mergeReviewScoresIntoForm(normalizeFetchedForm(data), reviews);

  return {
    ...directData,
    ...(directForm ? { form: directForm } : {}),
    ...(payload ? { payload: { ...payload, ...(payloadForm ? { form: payloadForm } : {}) } } : {}),
  };
};

const renameKeys = (rows, mapping) =>
  (rows || []).map((row) => {
    const out = { ...row };
    Object.entries(mapping).forEach(([from, to]) => {
      if (from in out) { out[to] = out[from]; delete out[from]; }
    });
    return out;
  });

const mapFormForSubmit = (form) => ({
  ...form,
  lectures: renameKeys(form.lectures, {
    sem: "semester", code: "course_code",
    planned: "planned_classes", conducted: "conducted_classes",
  }),
  feedback: renameKeys(form.feedback, {
    code: "course_code", fb1: "feedback_1", fb2: "feedback_2",
  }),
  society: renameKeys(form.society, { label: "activity" }),
  journals: renameKeys(form.journals, { index: "indexing" }),
  books: renameKeys(form.books, {
    pub: "publisher", coauth: "coauthor", first: "first_author",
  }),
  ict: renameKeys(form.ict, { desc: "description", quad: "quadrant" }),
  research: renameKeys(form.research, { name: "student_name" }),
  projects2: renameKeys(form.projects2, {
    date: "sanction_date", status: "project_status",
  }),
  externalProjects: renameKeys(form.externalProjects, {
    date: "sanction_date", status: "project_status",
  }),
  patents: renameKeys(form.patents, {
    date: "patent_date", status: "patent_status", fileNo: "file_no",
  }),
  awards: renameKeys(form.awards, { date: "award_date" }),
  confs: renameKeys(form.confs, { org: "organization" }),
  fdps: renameKeys(form.fdps, { org: "organization" }),
});

export const submitAppraisal = async ({
  facultyEmail,
  academicYear,
  form,
  totals,
  docs,
  submitterProfile,
  activeProfile,
}) => {
  if (!facultyEmail) throw new Error("Please login again. Your email was not found in this session.");
  if (!academicYear) throw new Error("Academic year is required before submitting.");

  const workflowProfile = submitterProfile || activeProfile || {};
  const reviewChain = getReviewChain(workflowProfile);
  const nextReviewer = reviewChain[0] || "";
  const workflowStatus = nextReviewer ? pendingStatusFor(nextReviewer) : "Submitted";
  const basePayload = {
    academic_year: academicYear,
    form: mapFormForSubmit(form),
    totals,
    docs,
    submitter_profile: submitterProfile || activeProfile,
  };

  try {
    await api.post("/appraisal/submit", {
      ...basePayload,
      status: workflowStatus,
      workflow_status: workflowStatus,
      next_reviewer: nextReviewer,
      next_reviewer_role: nextReviewer,
      review_chain: reviewChain,
    });
  } catch (err) {
    if (![400, 422].includes(err?.response?.status)) throw err;
    await api.post("/appraisal/submit", basePayload);
  }
};

// Section rows → used by the review workflow to get section data from snapshot rows.
export const sectionRowsFromSnapshot = (snapshotPayload) => {
  const form = snapshotFormFromPayload(snapshotPayload);
  if (!form) return {};
  return form;
};

export const saveAppraisal = saveAppraisalDraftSection;
