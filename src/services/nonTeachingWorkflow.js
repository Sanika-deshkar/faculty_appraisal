import { APP_INFO } from "../constants/formConfig";
import {
  NON_TEACHING_ROLE_LABELS,
  isNonTeachingRole,
  normalizeNonTeachingRole,
} from "../constants/nonTeachingHierarchy";
import { profileFromsessionStorage } from "../utils/hierarchy";
import { supabase } from "./supabase";

export const NON_TEACHING_STATUS = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  RO_REVIEWED: "Reporting Officer Reviewed",
  REGISTRAR_REVIEWED: "Registrar Reviewed",
  VC_APPROVED: "VC Approved",
};

export const NON_TEACHING_MAX = {
  partA: 25,
  partB: 105,
  grand: 130,
};

export const SELF_ITEMS = [
  { key: "selfResp", label: "Current Responsibilities", max: 10 },
  { key: "selfContrib", label: "Other Useful Contributions", max: 10 },
  { key: "selfAchieve", label: "Achievements", max: 5 },
];

export const RATING_SCALE = [
  { value: 5, label: "Excellent", color: "#059669", bg: "#d1fae5" },
  { value: 4, label: "Very Good", color: "#0284c7", bg: "#dbeafe" },
  { value: 3, label: "Good", color: "#7c3aed", bg: "#ede9fe" },
  { value: 2, label: "Average", color: "#d97706", bg: "#fef3c7" },
  { value: 1, label: "Below Average", color: "#dc2626", bg: "#fee2e2" },
];

export const RATING_SECTIONS = [
  {
    key: "profComp",
    title: "Professional Competence",
    max: 25,
    accent: "#1d4ed8",
    params: [
      "Knowledge of rules, regulations and procedures",
      "Ability to organize work and carry it out",
      "Ability and willingness to take up additional assignments in exigencies",
      "Creativity and innovation",
      "Ability to learn and perform new duties",
    ],
  },
  {
    key: "quality",
    title: "Quality of Work",
    max: 25,
    accent: "#0891b2",
    params: [
      "Ability to maintain files and office records",
      "Accuracy and speed of work",
      "Neatness and tidiness of work",
      "Completion of work on time",
      "Diligence and sense of responsibility",
    ],
  },
  {
    key: "personal",
    title: "Personal Characteristics",
    max: 30,
    accent: "#7c3aed",
    params: [
      "Reliability",
      "Attitude and respect",
      "Discipline",
      "Team work spirit",
      "Integrity and behavior",
      "Interpersonal relations",
    ],
  },
  {
    key: "regular",
    title: "Regularity",
    max: 25,
    accent: "#059669",
    params: [
      "Attendance consistency and punctuality",
      "Leave planning and approval discipline",
      "Communication and intimation",
      "Adherence to working hours",
      "Responsibility during absence",
    ],
  },
];

const n = (value) => parseFloat(value) || 0;
const clean = (value) => String(value ?? "").trim();
const emailKey = (value) => clean(value).toLowerCase();
const academicYear = (value) =>
  clean(value) || APP_INFO.DEFAULT_AY || "2025-2026";
const nowIso = () => new Date().toISOString();

const requireSupabase = (error, action) => {
  if (error) throw new Error(`${action}: ${error.message}`);
};

const initialsFor = (name = "", fallback = "U") =>
  clean(name || fallback)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

export const nonTeachingRoleLabel = (role) =>
  role === "vc"
    ? "VC"
    : NON_TEACHING_ROLE_LABELS[normalizeNonTeachingRole(role, role)] || role;

export const createEmptyPartB = () =>
  Object.fromEntries(RATING_SECTIONS.map((section) => [section.key, {}]));

export const emptyNonTeachingForm = (
  profile = profileFromsessionStorage(),
  role = "non_teaching_staff",
) => {
  const normalizedRole = normalizeNonTeachingRole(role, role);
  const name =
    profile.full_name || profile.name || sessionStorage.getItem("name") || "";
  const email = emailKey(
    profile.email || sessionStorage.getItem("username") || "",
  );

  return {
    appraisalType: "non-teaching",
    submittedByRole: normalizedRole,
    status: NON_TEACHING_STATUS.DRAFT,
    info: {
      name,
      email,
      employeeId:
        profile.employee_id ||
        profile.employeeId ||
        sessionStorage.getItem("employeeId") ||
        "",
      designation:
        profile.designation ||
        sessionStorage.getItem("designation") ||
        nonTeachingRoleLabel(normalizedRole),
      department:
        profile.department || sessionStorage.getItem("department") || "",
      reportingHead: "",
      ay: academicYear(
        profile.academic_year || profile.ay || APP_INFO.DEFAULT_AY,
      ),
    },
    selfResp: { text: "", marks: "" },
    selfContrib: { text: "", marks: "" },
    selfAchieve: { text: "", marks: "" },
    partB: createEmptyPartB(),
    docs: {},
    remarks: "",
    roRemarks: "",
    registrarRemarks: "",
    vcRemarks: "",
  };
};

export const normalizeNonTeachingForm = (
  payload = {},
  profile = {},
  role = "non_teaching_staff",
) => {
  const base = emptyNonTeachingForm(profile, role);
  const form = payload && typeof payload === "object" ? payload : {};
  const merged = {
    ...base,
    ...form,
    info: {
      ...base.info,
      ...(form.info || {}),
    },
    partB: {
      ...base.partB,
      ...(form.partB || {}),
    },
    docs: form.docs || base.docs,
  };

  merged.status = form.status || base.status;
  merged.submittedByRole = normalizeNonTeachingRole(
    form.submittedByRole,
    normalizeNonTeachingRole(role, role),
  );
  merged.info.ay = academicYear(merged.info.ay || profile.academic_year);
  merged.info.email = emailKey(
    merged.info.email || profile.email || sessionStorage.getItem("username"),
  );

  SELF_ITEMS.forEach(({ key }) => {
    merged[key] = {
      ...(base[key] || {}),
      ...(form[key] || {}),
    };
  });

  RATING_SECTIONS.forEach(({ key }) => {
    merged.partB[key] = {
      ...(base.partB[key] || {}),
      ...(form.partB?.[key] || {}),
    };
  });

  return merged;
};

const valueForAuthority = (row = {}, authority) => {
  if (authority === "self") return row.marks;
  if (authority === "reporting_officer") return row.roMarks;
  if (authority === "registrar") return row.regMarks;
  if (authority === "vc") return row.vcMarks;
  return "";
};

const ratingForAuthority = (section = {}, index, authority) => {
  const suffix =
    authority === "reporting_officer"
      ? "ro"
      : authority === "registrar"
        ? "reg"
        : authority;
  return section[`p${index}_${suffix}`];
};

export const calculateNonTeachingTotals = (form = {}, authority = "self") => {
  const normalized = normalizeNonTeachingForm(form);
<<<<<<< HEAD
  const partA = SELF_ITEMS.reduce(
    (total, item) =>
      total + n(valueForAuthority(normalized[item.key], authority)),
    0,
  );
  const partB =
    authority === "self"
      ? 0
      : RATING_SECTIONS.reduce((sectionTotal, section) => {
          const rows = normalized.partB?.[section.key] || {};
          return (
            sectionTotal +
            section.params.reduce(
              (total, _label, index) =>
                total + n(ratingForAuthority(rows, index, authority)),
              0,
            )
          );
        }, 0);
=======
  const partA = SELF_ITEMS.reduce((total, item) => total + n(valueForAuthority(normalized[item.key], authority)), 0);
  const partB = authority === "self" ? 0 : RATING_SECTIONS.reduce((sectionTotal, section) => {
    const rows = normalized.partB?.[section.key] || {};
    return sectionTotal + section.params.reduce((total, _label, index) => total + n(ratingForAuthority(rows, index, authority)), 0);
  }, 0);
>>>>>>> e8ced074a7c29e460502bfe25b88c5efc1363597

  return {
    partA,
    partB,
    total: partA + partB,
  };
};

export const statusAfterSelfSubmit = (role) => {
  const normalizedRole = normalizeNonTeachingRole(role, role);
  if (normalizedRole === "registrar")
    return NON_TEACHING_STATUS.REGISTRAR_REVIEWED;
  if (normalizedRole === "reporting_officer")
    return NON_TEACHING_STATUS.RO_REVIEWED;
  return NON_TEACHING_STATUS.SUBMITTED;
};

export const reviewerStatus = (role) => {
  const normalizedRole = normalizeNonTeachingRole(role, role);
  if (normalizedRole === "reporting_officer")
    return NON_TEACHING_STATUS.RO_REVIEWED;
  if (normalizedRole === "registrar")
    return NON_TEACHING_STATUS.REGISTRAR_REVIEWED;
  if (normalizedRole === "vc") return NON_TEACHING_STATUS.VC_APPROVED;
  return NON_TEACHING_STATUS.SUBMITTED;
};

export const expectedPendingStatus = (role) => {
  const normalizedRole = normalizeNonTeachingRole(role, role);
  if (normalizedRole === "reporting_officer")
    return NON_TEACHING_STATUS.SUBMITTED;
  if (normalizedRole === "registrar") return NON_TEACHING_STATUS.RO_REVIEWED;
  if (normalizedRole === "vc") return NON_TEACHING_STATUS.REGISTRAR_REVIEWED;
  return NON_TEACHING_STATUS.DRAFT;
};

export const canReviewNonTeachingItem = (item = {}, reviewerRole) => {
  const role = normalizeNonTeachingRole(reviewerRole, reviewerRole);
  const subjectRole = normalizeNonTeachingRole(
    item.appraisalRole || item.form?.submittedByRole,
    item.appraisalRole || item.form?.submittedByRole,
  );

  if (role === "vc")
    return subjectRole !== "vc" && isNonTeachingRole(subjectRole);
  if (role === "registrar")
    return (
      subjectRole === "non_teaching_staff" ||
      subjectRole === "reporting_officer"
    );
  if (role === "reporting_officer") return subjectRole === "non_teaching_staff";
  return false;
};

export const isNonTeachingReviewComplete = (item = {}) =>
  item.status === NON_TEACHING_STATUS.VC_APPROVED || n(item.vcTotal) > 0;

const validateMarks = (form, authority) => {
  for (const { key, label, max } of SELF_ITEMS) {
    if (n(valueForAuthority(form[key], authority)) > max) {
      throw new Error(`${label} exceeds the maximum of ${max} marks.`);
    }
  }
};

export const validateNonTeachingForm = (
  form,
  authority = "self",
  requireRatings = false,
) => {
  validateMarks(form, authority);

  if (!requireRatings || authority === "self") return;

  for (const section of RATING_SECTIONS) {
    for (let index = 0; index < section.params.length; index += 1) {
      const value = n(
        ratingForAuthority(form.partB?.[section.key], index, authority),
      );
      if (value < 1 || value > 5) {
        throw new Error(`Please fill all ratings in ${section.title}.`);
      }
    }
  }
};

const stripSelfPartBRatings = (form) => {
  const nextForm = normalizeNonTeachingForm(form);
  RATING_SECTIONS.forEach((section) => {
    const rows = nextForm.partB?.[section.key] || {};
    section.params.forEach((_label, index) => {
      delete rows[`p${index}_self`];
    });
    nextForm.partB[section.key] = rows;
  });
  return nextForm;
};

export const loadNonTeachingAppraisal = async ({
  email = sessionStorage.getItem("username"),
  academicYear = APP_INFO.DEFAULT_AY,
  profile = profileFromsessionStorage(),
  role = sessionStorage.getItem("role"),
} = {}) => {
  const staffEmail = emailKey(email);
  if (!staffEmail) return null;

  const { data, error } = await supabase
    .from("non_teaching_appraisals")
    .select("*")
    .eq("staff_email", staffEmail)
    .eq("academic_year", academicYear)
    .maybeSingle();

  requireSupabase(error, "Could not load non-teaching appraisal");

  if (!data) return null;

  return {
    ...data,
    form: normalizeNonTeachingForm(data.payload, profile, role),
  };
};

const rowPayloadForForm = ({ form, status }) => {
  const normalizedForm = normalizeNonTeachingForm({ ...form, status });
  return {
    payload: normalizedForm,
    status,
    self_total: calculateNonTeachingTotals(normalizedForm, "self").total,
    ro_total: calculateNonTeachingTotals(normalizedForm, "reporting_officer")
      .total,
    registrar_total: calculateNonTeachingTotals(normalizedForm, "registrar")
      .total,
    vc_total: calculateNonTeachingTotals(normalizedForm, "vc").total,
    updated_at: nowIso(),
  };
};

export const submitNonTeachingSelfAppraisal = async ({
  form,
  role = sessionStorage.getItem("role"),
  profile = profileFromsessionStorage(),
} = {}) => {
  const normalizedRole = normalizeNonTeachingRole(role, role);
  const status = statusAfterSelfSubmit(normalizedRole);
<<<<<<< HEAD
  const finalForm = stripSelfPartBRatings(
    normalizeNonTeachingForm(
      { ...form, status, submittedByRole: normalizedRole },
      profile,
      normalizedRole,
    ),
  );
=======
  const finalForm = stripSelfPartBRatings(normalizeNonTeachingForm({ ...form, status, submittedByRole: normalizedRole }, profile, normalizedRole));
>>>>>>> e8ced074a7c29e460502bfe25b88c5efc1363597

  validateNonTeachingForm(finalForm, "self", false);

  const staffEmail = emailKey(
    finalForm.info.email || profile.email || sessionStorage.getItem("username"),
  );
  const ay = academicYear(finalForm.info.ay);
  const rowPayload = rowPayloadForForm({ form: finalForm, status });

  const { data, error } = await supabase
    .from("non_teaching_appraisals")
    .upsert(
      {
        staff_email: staffEmail,
        academic_year: ay,
        ...rowPayload,
        submitted_at: nowIso(),
        ro_reviewed_at:
          status === NON_TEACHING_STATUS.RO_REVIEWED ? nowIso() : null,
        registrar_reviewed_at:
          status === NON_TEACHING_STATUS.REGISTRAR_REVIEWED ? nowIso() : null,
        vc_reviewed_at:
          status === NON_TEACHING_STATUS.VC_APPROVED ? nowIso() : null,
      },
      { onConflict: "staff_email,academic_year" },
    )
    .select()
    .single();

  requireSupabase(error, "Could not submit non-teaching appraisal");

  return {
    ...data,
    form: normalizeNonTeachingForm(data.payload, profile, normalizedRole),
  };
};

const profileMapForEmails = async (emails) => {
  const uniqueEmails = [
    ...new Set((emails || []).map(emailKey).filter(Boolean)),
  ];
  if (!uniqueEmails.length) return new Map();

  const { data, error } = await supabase
    .from("faculty_profiles")
    .select("*")
    .in("email", uniqueEmails);

  requireSupabase(error, "Could not load non-teaching profiles");

  return new Map(
    (data || []).map((profile) => [emailKey(profile.email), profile]),
  );
};

const allowedStatusesForReviewer = (reviewerRole) => {
  const role = normalizeNonTeachingRole(reviewerRole, reviewerRole);
  if (role === "reporting_officer") {
    return [
      NON_TEACHING_STATUS.SUBMITTED,
      NON_TEACHING_STATUS.RO_REVIEWED,
      NON_TEACHING_STATUS.REGISTRAR_REVIEWED,
      NON_TEACHING_STATUS.VC_APPROVED,
    ];
  }
  if (role === "registrar") {
    return [
      NON_TEACHING_STATUS.RO_REVIEWED,
      NON_TEACHING_STATUS.REGISTRAR_REVIEWED,
      NON_TEACHING_STATUS.VC_APPROVED,
    ];
  }
  if (role === "vc") {
    return [
      NON_TEACHING_STATUS.REGISTRAR_REVIEWED,
      NON_TEACHING_STATUS.VC_APPROVED,
    ];
  }
  return [];
};

export const decorateNonTeachingRow = (row, profile = {}) => {
  const form = normalizeNonTeachingForm(
    row.payload,
    profile,
    profile.appraisal_role,
  );
  const role = normalizeNonTeachingRole(
    profile.appraisal_role,
    normalizeNonTeachingRole(form.submittedByRole, "non_teaching_staff"),
  );
  const name = profile.full_name || form.info?.name || row.staff_email;
  const roTotals = calculateNonTeachingTotals(form, "reporting_officer");
  const registrarTotals = calculateNonTeachingTotals(form, "registrar");
  const vcTotals = calculateNonTeachingTotals(form, "vc");

  return {
    id: `${row.staff_email}:${row.academic_year}`,
    email: row.staff_email,
    staff_email: row.staff_email,
    academicYear: row.academic_year,
    form,
    name,
    employeeId: profile.employee_id || form.info?.employeeId || "",
    designation:
      profile.designation ||
      form.info?.designation ||
      nonTeachingRoleLabel(role),
    department: profile.department || form.info?.department || "",
    appraisalRole: role,
    roleLabel: nonTeachingRoleLabel(role),
    avatar: initialsFor(name, row.staff_email),
    avatarColor:
      role === "registrar"
        ? "#7c3aed"
        : role === "reporting_officer"
          ? "#0891b2"
          : "#1d4ed8",
    status: row.status || form.status,
    submittedOn: row.submitted_at
      ? new Date(row.submitted_at).toLocaleDateString()
      : "",
    selfTotal: n(row.self_total),
    roTotal: n(row.ro_total || roTotals.total),
    registrarTotal: n(row.registrar_total || registrarTotals.total),
    vcTotal: n(row.vc_total || vcTotals.total),
    declaration: row,
  };
};

export const fetchNonTeachingQueueForRole = async ({
  reviewerRole,
  academicYear,
} = {}) => {
  const role = normalizeNonTeachingRole(reviewerRole, reviewerRole);
  const statuses = allowedStatusesForReviewer(role);
  if (!statuses.length) return [];

  let query = supabase
    .from("non_teaching_appraisals")
    .select("*")
    .in("status", statuses)
    .order("updated_at", { ascending: false });

  if (academicYear) {
    query = query.eq("academic_year", academicYear);
  }

  const { data, error } = await query;
  requireSupabase(error, "Could not load non-teaching review queue");

  const profiles = await profileMapForEmails(
    (data || []).map((row) => row.staff_email),
  );

  return (data || [])
    .map((row) =>
      decorateNonTeachingRow(row, profiles.get(emailKey(row.staff_email))),
    )
    .filter((item) => canReviewNonTeachingItem(item, role));
};

export const primeFormForReviewer = (form = {}, reviewerRole) => {
  const role = normalizeNonTeachingRole(reviewerRole, reviewerRole);
  const nextForm = normalizeNonTeachingForm(form);

<<<<<<< HEAD
  const partBTarget =
    role === "vc" ? "vc" : role === "registrar" ? "reg" : "ro";
=======
  const partBTarget = role === "vc" ? "vc" : role === "registrar" ? "reg" : "ro";
>>>>>>> e8ced074a7c29e460502bfe25b88c5efc1363597

  SELF_ITEMS.forEach(({ key }) => {
    const item = nextForm[key] || {};
    const targetKey =
      role === "vc" ? "vcMarks" : role === "registrar" ? "regMarks" : "roMarks";
    if (!clean(item[targetKey])) {
      item[targetKey] = "";
    }
    nextForm[key] = item;
  });

  RATING_SECTIONS.forEach((section) => {
    const rows = nextForm.partB[section.key] || {};
    section.params.forEach((_label, index) => {
      const targetKey = `p${index}_${partBTarget}`;
      if (!clean(rows[targetKey])) {
        rows[targetKey] = "";
      }
    });
    nextForm.partB[section.key] = rows;
  });

  return nextForm;
};

export const submitNonTeachingReview = async ({
  item,
  form,
  reviewerRole,
  remarks = "",
} = {}) => {
  const role = normalizeNonTeachingRole(reviewerRole, reviewerRole);
  const status = reviewerStatus(role);
  const expectedStatus = expectedPendingStatus(role);
  const currentStatus = item?.status || form?.status;

  if (currentStatus !== expectedStatus && currentStatus !== status) {
    throw new Error(
      `This appraisal is not pending ${nonTeachingRoleLabel(role)} review.`,
    );
  }
  if (!canReviewNonTeachingItem(item, role)) {
    throw new Error(
      `${nonTeachingRoleLabel(role)} is not authorized to review this appraisal.`,
    );
  }

  const authority = role === "vc" ? "vc" : role;
  const finalForm = normalizeNonTeachingForm(
    {
      ...form,
      status,
      roRemarks: role === "reporting_officer" ? remarks : form.roRemarks,
      registrarRemarks: role === "registrar" ? remarks : form.registrarRemarks,
      vcRemarks: role === "vc" ? remarks : form.vcRemarks,
    },
    item?.form?.info || {},
    item?.appraisalRole,
  );

  validateNonTeachingForm(finalForm, authority, true);

  const staffEmail = emailKey(item?.email || finalForm.info.email);
  const ay = academicYear(item?.academicYear || finalForm.info.ay);
  const rowPayload = rowPayloadForForm({ form: finalForm, status });
  const timestampColumn =
    role === "reporting_officer"
      ? "ro_reviewed_at"
      : role === "registrar"
        ? "registrar_reviewed_at"
        : "vc_reviewed_at";

  const { data, error } = await supabase
    .from("non_teaching_appraisals")
    .update({
      ...rowPayload,
      status,
      [timestampColumn]: nowIso(),
    })
    .match({ staff_email: staffEmail, academic_year: ay })
    .select()
    .single();

  requireSupabase(error, "Could not submit non-teaching review");

  return decorateNonTeachingRow(data, {
    email: staffEmail,
    full_name: item?.name || finalForm.info.name,
    employee_id: item?.employeeId,
    designation: item?.designation,
    department: item?.department,
    appraisal_role: item?.appraisalRole,
  });
};

const escapeHtml = (value) =>
  clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const ratingLabel = (value) => {
  const match = RATING_SCALE.find((rating) => rating.value === n(value));
  return match ? `${value} - ${match.label}` : value || "";
};

export const openNonTeachingReport = ({
  item = {},
  form = item.form,
  generatedBy = localStorage.getItem("name") || "Authority",
  visibleRoles = ["self", "ro", "registrar", "vc"],
  includePartB = true,
} = {}) => {
  const reportForm = normalizeNonTeachingForm(
    form || item.form,
    item,
    item.appraisalRole,
  );
  const totals = {
    self: calculateNonTeachingTotals(reportForm, "self"),
    ro: calculateNonTeachingTotals(reportForm, "reporting_officer"),
    registrar: calculateNonTeachingTotals(reportForm, "registrar"),
    vc: calculateNonTeachingTotals(reportForm, "vc"),
  };
<<<<<<< HEAD
  const normalizeReportRole = (role) =>
    ({
      reporting_officer: "ro",
      reg: "registrar",
    })[role] || role;
  const reportRoles = Array.from(
    new Set(["self", ...(visibleRoles || []).map(normalizeReportRole)]),
  ).filter((role) => ["self", "ro", "registrar", "vc"].includes(role));
  const partBRoles = reportRoles.filter((role) => role !== "self");
  const maxForRole = (role) =>
    role === "self" ? NON_TEACHING_MAX.partA : NON_TEACHING_MAX.grand;
=======
  const normalizeReportRole = (role) => ({
    reporting_officer: "ro",
    reg: "registrar",
  }[role] || role);
  const reportRoles = Array.from(new Set(["self", ...(visibleRoles || []).map(normalizeReportRole)]))
    .filter((role) => ["self", "ro", "registrar", "vc"].includes(role));
  const partBRoles = reportRoles.filter((role) => role !== "self");
  const maxForRole = (role) => role === "self" ? NON_TEACHING_MAX.partA : NON_TEACHING_MAX.grand;
>>>>>>> e8ced074a7c29e460502bfe25b88c5efc1363597
  const reportColumns = {
    self: {
      label: "Self",
      total: totals.self.total,
      partA: (key) => reportForm[key]?.marks,
      remarks: reportForm.remarks,
      remarksLabel: "Staff",
    },
    ro: {
      label: "RO",
      total: totals.ro.total,
      partA: (key) => reportForm[key]?.roMarks,
      partB: (row, index) => row[`p${index}_ro`],
      remarks: reportForm.roRemarks,
      remarksLabel: "Reporting Officer",
    },
    registrar: {
      label: "Registrar",
      total: totals.registrar.total,
      partA: (key) => reportForm[key]?.regMarks,
      partB: (row, index) => row[`p${index}_reg`],
      remarks: reportForm.registrarRemarks,
      remarksLabel: "Registrar",
    },
    vc: {
      label: "VC",
      total: totals.vc.total,
      partA: (key) => reportForm[key]?.vcMarks,
      partB: (row, index) => row[`p${index}_vc`],
      remarks: reportForm.vcRemarks,
      remarksLabel: "VC",
    },
  };
<<<<<<< HEAD
  const docsFor = (key) =>
    (reportForm.docs?.[key] || [])
      .map(
        (file) =>
          `<a href="${escapeHtml(file.url)}" target="_blank">${escapeHtml(file.name || file.url)}</a>`,
      )
      .join("<br>") || "-";
=======
  const docsFor = (key) => (reportForm.docs?.[key] || [])
    .map((file) => `<a href="${escapeHtml(file.url)}" target="_blank">${escapeHtml(file.name || file.url)}</a>`)
    .join("<br>") || "-";
>>>>>>> e8ced074a7c29e460502bfe25b88c5efc1363597

  const partARows = SELF_ITEMS.map(
    ({ key, label, max }) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(reportForm[key]?.text)}</td>
      <td>${docsFor(key)}</td>
      <td>${max}</td>
      ${reportRoles.map((role) => `<td>${escapeHtml(reportColumns[role].partA(key))}</td>`).join("")}
    </tr>
  `,
  ).join("");

  const partBRows = RATING_SECTIONS.map(
    (section) => `
    <h3>${escapeHtml(section.title)} (Max ${section.max})</h3>
    <table>
      <thead>
        <tr><th>Parameter</th>${partBRoles.map((role) => `<th>${escapeHtml(reportColumns[role].label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${section.params
          .map((param, index) => {
            const row = reportForm.partB?.[section.key] || {};
            return `<tr>
            <td>${escapeHtml(param)}</td>
            ${partBRoles.map((role) => `<td>${escapeHtml(ratingLabel(reportColumns[role].partB(row, index)))}</td>`).join("")}
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `,
  ).join("");

  const reportWindow = window.open("", "_blank", "width=1100,height=800");
  if (!reportWindow) return;

  reportWindow.document.write(`
    <html>
      <head>
        <title>Non-Teaching Appraisal Report</title>
        <style>
          body { font-family: Georgia, serif; color: #0f172a; padding: 28px; }
          h1 { margin: 0 0 4px; font-size: 24px; }
          h2 { margin: 22px 0 8px; font-size: 16px; color: #1d4ed8; }
          h3 { margin: 18px 0 8px; font-size: 14px; color: #155e75; }
          .muted { color: #64748b; font-size: 12px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 18px; margin: 18px 0; }
          .box { border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 6px; }
          .label { color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
          th { background: #0f172a; color: #e2e8f0; text-align: left; }
          .totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
          .total { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
          .score { font-size: 18px; font-weight: 800; color: #1d4ed8; }
          @media print { button { display: none; } body { padding: 10px; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="float:right;padding:8px 14px;">Print</button>
        <h1>Non-Teaching Staff Appraisal Report</h1>
        <div class="muted">${escapeHtml(APP_INFO.UNIVERSITY_NAME)} | Academic Year ${escapeHtml(reportForm.info?.ay || item.academicYear)}</div>

        <div class="grid">
          ${[
            ["Name", reportForm.info?.name || item.name],
            ["Employee ID", reportForm.info?.employeeId || item.employeeId],
            [
              "Role",
              nonTeachingRoleLabel(
                item.appraisalRole || reportForm.submittedByRole,
              ),
            ],
            ["Designation", reportForm.info?.designation || item.designation],
            ["Department", reportForm.info?.department || item.department],
            ["Status", reportForm.status || item.status],
          ]
            .map(
              ([label, value]) =>
                `<div class="box"><div class="label">${label}</div><div>${escapeHtml(value)}</div></div>`,
            )
            .join("")}
        </div>

        <div class="totals" style="grid-template-columns: repeat(${reportRoles.length}, 1fr);">
          ${reportRoles.map((role) => `<div class="total"><div class="label">${escapeHtml(reportColumns[role].remarksLabel)}</div><div class="score">${reportColumns[role].total.toFixed(1)} / ${maxForRole(role)}</div></div>`).join("")}
        </div>

        <h2>Part A - Self Appraisal</h2>
        <table>
          <thead>
            <tr><th>Particular</th><th>Description</th><th>Documents</th><th>Max</th>${reportRoles.map((role) => `<th>${escapeHtml(reportColumns[role].label)}</th>`).join("")}</tr>
          </thead>
          <tbody>${partARows}</tbody>
        </table>

        ${includePartB && partBRoles.length ? `<h2>Part B - Authority Ratings</h2>${partBRows}` : ""}

        <h2>Remarks</h2>
        <table>
          <tbody>
            ${reportRoles.map((role) => `<tr><th>${escapeHtml(reportColumns[role].remarksLabel)}</th><td>${escapeHtml(reportColumns[role].remarks)}</td></tr>`).join("")}
          </tbody>
        </table>
        <div class="muted">Generated by ${escapeHtml(generatedBy)} on ${new Date().toLocaleString()}</div>
      </body>
    </html>
  `);
  reportWindow.document.close();
};
