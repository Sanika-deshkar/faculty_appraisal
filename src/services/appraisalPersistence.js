import { api } from "./api";

const inputValue = (value) => value ?? "";

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
};

const reviewerScores = (row) => ({
  hod: inputValue(row.hod_score),
  director: inputValue(row.director_score),
  dean: inputValue(row.dean_score),
  vc: inputValue(row.vc_score),
});

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
  if (!facultyEmail || !academicYear) return {};
  try {
    const data = await api.get(
      `/dashboard/faculty/${encodeURIComponent(facultyEmail)}`,
      { params: { academic_year: academicYear } }
    );
    return data || {};
  } catch {
    return {};
  }
};

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

  await api.post("/appraisal/submit", {
    academic_year: academicYear,
    form,
    totals,
    docs,
    submitter_profile: submitterProfile || activeProfile,
  });
};

// Section rows → used by the review workflow to get section data from snapshot rows.
export const sectionRowsFromSnapshot = (snapshotPayload) => {
  const form = snapshotFormFromPayload(snapshotPayload);
  if (!form) return {};
  return form;
};
