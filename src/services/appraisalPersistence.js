import { supabase } from "./supabase";
import { feedbackRowScore } from "../utils/appraisalFormUtils";
import { getReviewChain, pendingStatusFor, profileFromsessionStorage, workflowValidationError } from "../utils/hierarchy";

const n = (value) => parseFloat(value) || 0;
const inputValue = (value) => value ?? "";
const hasAnyValue = (row, keys) => keys.some((key) => String(row?.[key] ?? "").trim() !== "");
const reviewerScores = (row) => ({
  hod: inputValue(row.hod_score),
  director: inputValue(row.director_score),
  dean: inputValue(row.dean_score),
  vc: inputValue(row.vc_score),
});

const dbText = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const dbDate = (value) => {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const dbNumber = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : n(text);
};

const requireSupabase = (error, action) => {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
};

const docSectionFromKey = (docKey) => docKey.replace(/-\d+$/, "").replace(/\d+$/, "");

const docRowFromKey = (docKey) => {
  const match = docKey.match(/(\d+)$/);
  return match ? Number(match[1]) + 1 : null;
};

const SNAPSHOT_SETTERS = {
  info: "setInfo",
  lectures: "setLectures",
  courseFile: "setCourseFile",
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
  sectionSaveStatus: "setSectionSaveStatus",
};

const snapshotFormFromPayload = (payload) => {
  if (!payload) return null;
  if (payload.form && typeof payload.form === "object") return payload.form;
  if (payload.data && typeof payload.data === "object") return payload.data;
  return null;
};

export const loadAppraisalSnapshot = async ({ facultyEmail, academicYear }) => {
  if (!facultyEmail || !academicYear) return null;

  const { data, error } = await supabase
    .from("appraisal_snapshots")
    .select("payload")
    .eq("faculty_email", facultyEmail)
    .eq("academic_year", academicYear)
    .maybeSingle();

  requireSupabase(error, "Could not load appraisal snapshot");
  return data?.payload || null;
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

const saveAppraisalSnapshot = async ({
  facultyEmail,
  academicYear,
  form,
  totals,
  docs,
  submitterProfile,
}) => {
  const { error } = await supabase
    .from("appraisal_snapshots")
    .upsert({
      faculty_email: facultyEmail,
      academic_year: academicYear,
      payload: {
        form,
        totals,
        docs,
        submitterProfile,
        savedAt: new Date().toISOString(),
      },
    }, { onConflict: "faculty_email,academic_year" });

  requireSupabase(error, "Could not save appraisal snapshot");
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

  await saveAppraisalSnapshot({
    facultyEmail,
    academicYear,
    form: {
      ...form,
      sectionSaveStatus,
    },
    totals,
    docs,
    submitterProfile,
  });

  const documentRows = docsToRows(docs, facultyEmail, academicYear);
  const { error: documentDeleteError } = await supabase
    .from("appraisal_documents")
    .delete()
    .match({ faculty_email: facultyEmail, academic_year: academicYear });
  requireSupabase(documentDeleteError, "Could not clear old draft document rows");

  if (documentRows.length > 0) {
    const { error: documentInsertError } = await supabase
      .from("appraisal_documents")
      .insert(documentRows);
    requireSupabase(documentInsertError, "Could not save draft document rows");
  }
};

export const docsToRows = (docs, facultyEmail, academicYear) =>
  Object.entries(docs || {}).flatMap(([docKey, files]) =>
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

export const loadAppraisalDocuments = async ({ facultyEmail, academicYear, setDocs }) => {
  if (!facultyEmail || !academicYear || !setDocs) return;

  const { data, error } = await supabase
    .from("appraisal_documents")
    .select("*")
    .eq("faculty_email", facultyEmail)
    .eq("academic_year", academicYear)
    .order("uploaded_at", { ascending: true });

  requireSupabase(error, "Could not load saved documents");

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
};

export const loadSavedAppraisal = async ({
  facultyEmail,
  academicYear,
  setters,
}) => {
  if (!facultyEmail || !academicYear || !setters) return;

  const fetchRows = async (table, shouldOrder = true) => {
    let query = supabase
      .from(table)
      .select("*")
      .eq("faculty_email", facultyEmail)
      .eq("academic_year", academicYear);

    if (shouldOrder) {
      query = query.order("row_no", { ascending: true });
    }

    const { data, error } = await query;
    requireSupabase(error, `Could not load ${table}`);
    return data || [];
  };

  const [
    teachingRows,
    courseRows,
    innovativeRows,
    projectRows,
    qualificationRows,
    feedbackRows,
    departmentRows,
    universityRows,
    societyRows,
    industryRows,
    acrRows,
    journalRows,
    bookRows,
    ictRows,
    researchRows,
    researchProjectRows,
    patentRows,
    awardRows,
    conferenceRows,
    proposalRows,
    selfDevelopmentRows,
    trainingRows,
  ] = await Promise.all([
    fetchRows("teaching_process"),
    fetchRows("course_files"),
    fetchRows("innovative_teaching", false),
    fetchRows("projects_guided"),
    fetchRows("qualification_enhancement"),
    fetchRows("student_feedback"),
    fetchRows("department_activities"),
    fetchRows("university_activities"),
    fetchRows("social_contributions"),
    fetchRows("industry_connect"),
    fetchRows("acr_scores"),
    fetchRows("journal_publications"),
    fetchRows("book_publications"),
    fetchRows("ict_pedagogy"),
    fetchRows("research_guidance"),
    fetchRows("research_projects"),
    fetchRows("patents"),
    fetchRows("awards"),
    fetchRows("conferences"),
    fetchRows("research_proposals"),
    fetchRows("self_development"),
    fetchRows("industrial_training"),
  ]);

  if (teachingRows.length) {
    setters.setLectures?.(teachingRows.map((row) => ({
      sem: inputValue(row.semester),
      code: inputValue(row.course_code),
      planned: inputValue(row.planned_classes),
      conducted: inputValue(row.conducted_classes),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (courseRows.length) {
    setters.setCourseFile?.(courseRows.map((row) => ({
      course: inputValue(row.course),
      title: inputValue(row.title),
      details: inputValue(row.details),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (innovativeRows.length) {
    setters.setInnovDetails?.(inputValue(innovativeRows[0].details));
    setters.setInnovScore?.(inputValue(innovativeRows[0].score));
    setters.setInnovHod?.(inputValue(innovativeRows[0].hod_score));
    setters.setInnovDirector?.(inputValue(innovativeRows[0].director_score));
    setters.setInnovDean?.(inputValue(innovativeRows[0].dean_score));
    setters.setInnovVc?.(inputValue(innovativeRows[0].vc_score));
  }

  if (projectRows.length) {
    setters.setProjects?.(projectRows.map((row) => ({
      label: inputValue(row.label),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (qualificationRows.length) {
    setters.setQuals?.(qualificationRows.map((row) => ({
      label: inputValue(row.label),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (feedbackRows.length) {
    setters.setFeedback?.(feedbackRows.map((row) => ({
      code: inputValue(row.course_code),
      fb1: inputValue(row.feedback_1),
      fb2: inputValue(row.feedback_2),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (departmentRows.length) {
    setters.setDeptActs?.(departmentRows.map((row) => ({
      activity: inputValue(row.activity),
      nature: inputValue(row.nature),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (universityRows.length) {
    setters.setUniActs?.(universityRows.map((row) => ({
      activity: inputValue(row.activity),
      nature: inputValue(row.nature),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (societyRows.length) {
    setters.setSociety?.(societyRows.map((row) => ({
      label: inputValue(row.label),
      details: inputValue(row.details),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (industryRows.length) {
    setters.setIndustry?.(industryRows.map((row) => ({
      name: inputValue(row.name),
      details: inputValue(row.details),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (acrRows.length) {
    setters.setAcr?.(acrRows.map((row) => ({
      label: inputValue(row.label),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (journalRows.length) {
    setters.setJournals?.(journalRows.map((row) => ({
      title: inputValue(row.title),
      journal: inputValue(row.journal),
      issn: inputValue(row.issn),
      index: inputValue(row.indexing),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (bookRows.length) {
    setters.setBooks?.(bookRows.map((row) => ({
      title: inputValue(row.title),
      book: inputValue(row.book),
      issn: inputValue(row.issn),
      pub: inputValue(row.publisher),
      coauth: inputValue(row.coauthor),
      first: inputValue(row.first_author),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (ictRows.length) {
    setters.setIct?.(ictRows.map((row) => ({
      title: inputValue(row.title),
      desc: inputValue(row.description),
      type: inputValue(row.type),
      quad: inputValue(row.quadrant),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (researchRows.length) {
    setters.setResearch?.(researchRows.map((row) => ({
      degree: inputValue(row.degree),
      name: inputValue(row.student_name),
      thesis: inputValue(row.thesis),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (researchProjectRows.length) {
    setters.setProjects2?.(researchProjectRows.map((row) => ({
      title: inputValue(row.title),
      agency: inputValue(row.agency),
      date: inputValue(row.sanction_date),
      amount: inputValue(row.amount),
      role: inputValue(row.role),
      status: inputValue(row.project_status),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      ...reviewerScores(row),
    })));
  }

  if (patentRows.length) {
    setters.setPatents?.(patentRows.map((row) => ({
      title: inputValue(row.title),
      type: inputValue(row.type),
      date: inputValue(row.patent_date),
      status: inputValue(row.patent_status),
      fileNo: inputValue(row.file_no),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (awardRows.length) {
    setters.setAwards?.(awardRows.map((row) => ({
      title: inputValue(row.title),
      date: inputValue(row.award_date),
      agency: inputValue(row.agency),
      level: inputValue(row.level),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (conferenceRows.length) {
    setters.setConfs?.(conferenceRows.map((row) => ({
      title: inputValue(row.title),
      type: inputValue(row.type),
      org: inputValue(row.organization),
      level: inputValue(row.level),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (proposalRows.length) {
    setters.setProposals?.(proposalRows.map((row) => ({
      title: inputValue(row.title),
      duration: inputValue(row.duration),
      agency: inputValue(row.agency),
      amount: inputValue(row.amount),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (selfDevelopmentRows.length) {
    setters.setFdps?.(selfDevelopmentRows.map((row) => ({
      program: inputValue(row.program),
      duration: inputValue(row.duration),
      org: inputValue(row.organization),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  if (trainingRows.length) {
    setters.setTraining?.(trainingRows.map((row) => ({
      company: inputValue(row.company),
      duration: inputValue(row.duration),
      nature: inputValue(row.nature),
      score: inputValue(row.score),
      hod: inputValue(row.hod_score),
      director: inputValue(row.director_score),
      ...reviewerScores(row),
    })));
  }

  const snapshotPayload = await loadAppraisalSnapshot({ facultyEmail, academicYear });
  applySnapshotToSetters(snapshotPayload, setters);
};

export const fetchSavedAppraisal = async ({ facultyEmail, academicYear }) => {
  const appraisal = {
    info: { ay: academicYear },
    lectures: [],
    courseFile: [],
    innovDetails: "",
    innovScore: "",
    innovHod: "",
    innovDirector: "",
    innovDean: "",
    innovVc: "",
    projects: [],
    quals: [],
    feedback: [],
    deptActs: [],
    uniActs: [],
    society: [],
    industry: [],
    acr: [],
    journals: [],
    books: [],
    ict: [],
    research: [],
    projects2: [],
    popularWritings: [],
    internalProjects: [],
    externalProjects: [],
    ipr: [],
    patents: [],
    awards: [],
    confs: [],
    proposals: [],
    products: [],
    fdps: [],
    training: [],
    docs: {},
  };

  await Promise.all([
    loadSavedAppraisal({
      facultyEmail,
      academicYear,
      setters: {
        setLectures: (value) => { appraisal.lectures = value; },
        setCourseFile: (value) => { appraisal.courseFile = value; },
        setInnovDetails: (value) => { appraisal.innovDetails = value; },
        setInnovScore: (value) => { appraisal.innovScore = value; },
        setInnovHod: (value) => { appraisal.innovHod = value; },
        setInnovDirector: (value) => { appraisal.innovDirector = value; },
        setInnovDean: (value) => { appraisal.innovDean = value; },
        setInnovVc: (value) => { appraisal.innovVc = value; },
        setProjects: (value) => { appraisal.projects = value; },
        setQuals: (value) => { appraisal.quals = value; },
        setFeedback: (value) => { appraisal.feedback = value; },
        setDeptActs: (value) => { appraisal.deptActs = value; },
        setUniActs: (value) => { appraisal.uniActs = value; },
        setSociety: (value) => { appraisal.society = value; },
        setIndustry: (value) => { appraisal.industry = value; },
        setAcr: (value) => { appraisal.acr = value; },
        setJournals: (value) => { appraisal.journals = value; },
        setBooks: (value) => { appraisal.books = value; },
        setIct: (value) => { appraisal.ict = value; },
        setResearch: (value) => { appraisal.research = value; },
        setProjects2: (value) => { appraisal.projects2 = value; },
        setPopularWritings: (value) => { appraisal.popularWritings = value; },
        setInternalProjects: (value) => { appraisal.internalProjects = value; },
        setExternalProjects: (value) => { appraisal.externalProjects = value; },
        setIpr: (value) => { appraisal.ipr = value; },
        setPatents: (value) => { appraisal.patents = value; },
        setAwards: (value) => { appraisal.awards = value; },
        setConfs: (value) => { appraisal.confs = value; },
        setProposals: (value) => { appraisal.proposals = value; },
        setProducts: (value) => { appraisal.products = value; },
        setFdps: (value) => { appraisal.fdps = value; },
        setTraining: (value) => { appraisal.training = value; },
      },
    }),
    loadAppraisalDocuments({
      facultyEmail,
      academicYear,
      setDocs: (value) => { appraisal.docs = value; },
    }),
  ]);

  return appraisal;
};

export const saveAppraisal = async ({
  facultyEmail,
  academicYear,
  totals,
  form,
  docs = {},
  submitterProfile,
}) => {
  if (!facultyEmail) throw new Error("Please login again before submitting. Your email was not found in this session.");
  if (!academicYear) throw new Error("Academic year is required before submitting.");

  const {
    lectures = [],
    courseFile = [],
    innovDetails = "",
    innovScore = "",
    projects = [],
    quals = [],
    feedback = [],
    deptActs = [],
    uniActs = [],
    society = [],
    industry = [],
    acr = [],
    journals = [],
    books = [],
    ict = [],
    research = [],
    projects2 = [],
    popularWritings = [],
    internalProjects = [],
    externalProjects = [],
    ipr = [],
    patents = [],
    awards = [],
    confs = [],
    proposals = [],
    products = [],
    fdps = [],
    training = [],
  } = form;

  const activeProfile = submitterProfile || profileFromsessionStorage();
  const workflowError = workflowValidationError(activeProfile);
  if (workflowError) throw new Error(workflowError);

  const reviewChain = getReviewChain(activeProfile);
  const nextReviewer = reviewChain[0];
  const workflowStatus = nextReviewer ? pendingStatusFor(nextReviewer) : "Submitted";

  const { error: declError } = await supabase
    .from("declarations")
    .upsert({
      faculty_email: facultyEmail,
      academic_year: academicYear,
      part_a_total: totals.partATotal,
      part_b_total: totals.partBTotal,
      grand_total: totals.grandTotal,
      status: workflowStatus,
      submitted_at: new Date().toISOString(),
    }, { onConflict: "faculty_email,academic_year" });
  requireSupabase(declError, "Could not save declaration");

  const baseRow = (index) => ({
    faculty_email: facultyEmail,
    academic_year: academicYear,
    row_no: index + 1,
  });

  const replaceRows = async (table, rows, label) => {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .match({ faculty_email: facultyEmail, academic_year: academicYear });
    requireSupabase(deleteError, `Could not clear old ${label} rows`);

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from(table).insert(rows);
      requireSupabase(insertError, `Could not save ${label} rows`);
    }
  };

  await replaceRows("teaching_process", lectures
    .filter((row) => hasAnyValue(row, ["sem", "code", "planned", "conducted", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      semester: dbText(row.sem),
      course_code: dbText(row.code),
      planned_classes: n(row.planned),
      conducted_classes: n(row.conducted),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "teaching process");

  await replaceRows("course_files", courseFile
    .filter((row) => hasAnyValue(row, ["course", "title", "details", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      course: dbText(row.course),
      title: dbText(row.title),
      details: dbText(row.details),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "course file");

  await replaceRows("innovative_teaching",
    hasAnyValue({ details: innovDetails, score: innovScore }, ["details", "score"])
      ? [{
        faculty_email: facultyEmail,
        academic_year: academicYear,
        details: dbText(innovDetails),
        score: n(innovScore),
        hod_score: dbNumber(form.innovHod),
        director_score: dbNumber(form.innovDirector),
        dean_score: dbNumber(form.innovDean),
      }]
      : [],
    "innovative teaching");

  await replaceRows("projects_guided", projects
    .filter((row) => hasAnyValue(row, ["label", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      label: dbText(row.label),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "projects");

  await replaceRows("qualification_enhancement", quals
    .filter((row) => hasAnyValue(row, ["label", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      label: dbText(row.label),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "qualification enhancement");

  await replaceRows("student_feedback", feedback
    .filter((row) => hasAnyValue(row, ["code", "fb1", "fb2", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      course_code: dbText(row.code),
      feedback_1: n(row.fb1),
      feedback_2: n(row.fb2),
      score: feedbackRowScore(row, 10),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "student feedback");

  await replaceRows("department_activities", deptActs
    .filter((row) => hasAnyValue(row, ["activity", "nature", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      activity: dbText(row.activity),
      nature: dbText(row.nature),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "department activities");

  await replaceRows("university_activities", uniActs
    .filter((row) => hasAnyValue(row, ["activity", "nature", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      activity: dbText(row.activity),
      nature: dbText(row.nature),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "university activities");

  await replaceRows("social_contributions", society
    .filter((row) => hasAnyValue(row, ["label", "details", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      label: dbText(row.label),
      details: dbText(row.details),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "social contribution");

  await replaceRows("industry_connect", industry
    .filter((row) => hasAnyValue(row, ["name", "details", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      name: dbText(row.name),
      details: dbText(row.details),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "industry connect");

  await replaceRows("acr_scores", acr
    .filter((row) => hasAnyValue(row, ["label", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      label: dbText(row.label),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "ACR");

  await replaceRows("journal_publications", journals
    .filter((row) => hasAnyValue(row, ["title", "journal", "issn", "index", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      title: dbText(row.title),
      journal: dbText(row.journal),
      issn: dbText(row.issn),
      indexing: dbText(row.index),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "journal publications");

  await replaceRows("book_publications", books
    .filter((row) => hasAnyValue(row, ["title", "book", "issn", "pub", "coauth", "first", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      title: dbText(row.title),
      book: dbText(row.book),
      issn: dbText(row.issn),
      publisher: dbText(row.pub),
      coauthor: dbText(row.coauth),
      first_author: dbText(row.first),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "book publications");

  await replaceRows("ict_pedagogy", ict
    .filter((row) => hasAnyValue(row, ["title", "desc", "type", "quad", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      title: dbText(row.title),
      description: dbText(row.desc),
      type: dbText(row.type),
      quadrant: dbText(row.quad),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "ICT pedagogy");

  await replaceRows("research_guidance", research
    .filter((row) => hasAnyValue(row, ["degree", "name", "thesis", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      degree: dbText(row.degree),
      student_name: dbText(row.name),
      thesis: dbText(row.thesis),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "research guidance");

  await replaceRows("research_projects", projects2
    .filter((row) => hasAnyValue(row, ["title", "agency", "date", "amount", "role", "status", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      title: dbText(row.title),
      agency: dbText(row.agency),
      sanction_date: dbDate(row.date),
      amount: dbNumber(row.amount),
      role: dbText(row.role),
      project_status: dbText(row.status),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      dean_score: dbNumber(row.dean),
    })), "research projects");

  await replaceRows("patents", patents
    .filter((row) => hasAnyValue(row, ["title", "type", "date", "status", "fileNo", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      title: dbText(row.title),
      type: dbText(row.type),
      patent_date: dbDate(row.date),
      patent_status: dbText(row.status),
      file_no: dbText(row.fileNo),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "patents");

  await replaceRows("awards", awards
    .filter((row) => hasAnyValue(row, ["title", "date", "agency", "level", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      title: dbText(row.title),
      award_date: dbDate(row.date),
      agency: dbText(row.agency),
      level: dbText(row.level),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "awards");

  await replaceRows("conferences", confs
    .filter((row) => hasAnyValue(row, ["title", "type", "org", "level", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      title: dbText(row.title),
      type: dbText(row.type),
      organization: dbText(row.org),
      level: dbText(row.level),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "conferences");

  await replaceRows("research_proposals", proposals
    .filter((row) => hasAnyValue(row, ["title", "duration", "agency", "amount", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      title: dbText(row.title),
      duration: dbText(row.duration),
      agency: dbText(row.agency),
      amount: dbNumber(row.amount),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "research proposals");

  await replaceRows("self_development", fdps
    .filter((row) => hasAnyValue(row, ["program", "duration", "org", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      program: dbText(row.program),
      duration: dbText(row.duration),
      organization: dbText(row.org),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "self development");

  await replaceRows("industrial_training", training
    .filter((row) => hasAnyValue(row, ["company", "duration", "nature", "score"]))
    .map((row, index) => ({
      ...baseRow(index),
      company: dbText(row.company),
      duration: dbText(row.duration),
      nature: dbText(row.nature),
      score: n(row.score),
      hod_score: dbNumber(row.hod),
      director_score: dbNumber(row.director),
      dean_score: dbNumber(row.dean),
    })), "industrial training");

  const documentRows = docsToRows(docs, facultyEmail, academicYear);
  const { error: documentDeleteError } = await supabase
    .from("appraisal_documents")
    .delete()
    .match({ faculty_email: facultyEmail, academic_year: academicYear });
  requireSupabase(documentDeleteError, "Could not clear old document rows");

  if (documentRows.length > 0) {
    const { error: documentInsertError } = await supabase
      .from("appraisal_documents")
      .insert(documentRows);
    requireSupabase(documentInsertError, "Could not save document rows");
  }

  await saveAppraisalSnapshot({
    facultyEmail,
    academicYear,
    form: {
      ...form,
      popularWritings,
      internalProjects,
      externalProjects,
      ipr,
      products,
    },
    totals,
    docs,
    submitterProfile: activeProfile,
  });
};

