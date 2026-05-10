import { APP_INFO } from "../constants/formConfig";
import {
  NON_TEACHING_ROLE_LABELS,
  isNonTeachingRole,
  normalizeNonTeachingRole,
} from "../constants/nonTeachingHierarchy";
import { profileFromsessionStorage } from "../utils/hierarchy";
import { clampScore } from "../utils/appraisalFormUtils";
import { api } from "./api";

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
const clampOptionalScore = (value, max) =>
  clean(value) === "" ? "" : clampScore(value, max);
const clampOptionalRating = (value) => {
  if (clean(value) === "") return "";
  const rating = n(value);
  if (rating < 1) return "";
  return Math.min(5, rating);
};
const firstNonEmpty = (...values) =>
  values.find((value) => clean(value) !== "") || "";
const emailKey = (value) => clean(value).toLowerCase();
const academicYear = (value) =>
  clean(value) || APP_INFO.DEFAULT_AY || "2025-2026";
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

  SELF_ITEMS.forEach(({ key, max }) => {
    merged[key] = {
      ...(base[key] || {}),
      ...(form[key] || {}),
    };
    ["marks", "roMarks", "regMarks", "vcMarks"].forEach((field) => {
      merged[key][field] = clampOptionalScore(merged[key][field], max);
    });
  });

  RATING_SECTIONS.forEach(({ key }) => {
    merged.partB[key] = {
      ...(base.partB[key] || {}),
      ...(form.partB?.[key] || {}),
    };
  });

  RATING_SECTIONS.forEach(({ key, params }) => {
    const rows = merged.partB[key] || {};
    params.forEach((_label, index) => {
      ["self", "ro", "reg", "vc"].forEach((suffix) => {
        const field = `p${index}_${suffix}`;
        rows[field] = clampOptionalRating(rows[field]);
      });
    });
    merged.partB[key] = rows;
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
  const partA = clampScore(SELF_ITEMS.reduce(
    (total, item) =>
      total + n(clampOptionalScore(valueForAuthority(normalized[item.key], authority), item.max)),
    0,
  ), NON_TEACHING_MAX.partA);
  const partB =
    authority === "self"
      ? 0
      : clampScore(RATING_SECTIONS.reduce((sectionTotal, section) => {
          const rows = normalized.partB?.[section.key] || {};
          const sectionScore = section.params.reduce(
            (total, _label, index) =>
              total + n(clampOptionalRating(ratingForAuthority(rows, index, authority))),
            0,
          );
          return sectionTotal + clampScore(sectionScore, section.max);
        }, 0), NON_TEACHING_MAX.partB);

  return {
    partA,
    partB,
    total: clampScore(partA + partB, NON_TEACHING_MAX.grand),
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

export const visibleNonTeachingReviewRoles = (role) => {
  const normalizedRole = normalizeNonTeachingRole(role, role);
  if (normalizedRole === "vc") return ["self", "ro", "registrar", "vc"];
  if (normalizedRole === "registrar") return ["self", "registrar"];
  if (normalizedRole === "reporting_officer") return ["self", "ro"];
  return ["self"];
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
  academicYear: ay = APP_INFO.DEFAULT_AY,
  profile = profileFromsessionStorage(),
  role = sessionStorage.getItem("role"),
} = {}) => {
  const staffEmail = emailKey(email);
  if (!staffEmail) return null;

  try {
    const data = await api.get("/non-teaching/appraisal", {
      params: { academic_year: ay },
    });
    if (!data) return null;
    return {
      ...data,
      form: normalizeNonTeachingForm(data.payload, profile, role),
    };
  } catch {
    return null;
  }
};

export const submitNonTeachingSelfAppraisal = async ({
  form,
  role = sessionStorage.getItem("role"),
  profile = profileFromsessionStorage(),
} = {}) => {
  const normalizedRole = normalizeNonTeachingRole(role, role);
  const status = statusAfterSelfSubmit(normalizedRole);
  const finalForm = stripSelfPartBRatings(
    normalizeNonTeachingForm(
      { ...form, status, submittedByRole: normalizedRole },
      profile,
      normalizedRole,
    ),
  );

  validateNonTeachingForm(finalForm, "self", false);

  const staffEmail = emailKey(
    finalForm.info.email || profile.email || sessionStorage.getItem("username"),
  );
  const ay = academicYear(finalForm.info.ay);

  const data = await api.put("/non-teaching/appraisal", {
    staff_email: staffEmail,
    academic_year: ay,
    payload: finalForm,
    status,
  });

  return {
    ...data,
    form: normalizeNonTeachingForm(data?.payload, profile, normalizedRole),
  };
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

const normalizeNonTeachingQueueItem = (item = {}) => {
  const rawRole = firstNonEmpty(
    item.appraisalRole,
    item.appraisal_role,
    item.role,
    item.form?.submittedByRole,
    item.payload?.submittedByRole,
  );
  const role = normalizeNonTeachingRole(rawRole, rawRole || "non_teaching_staff");
  const form = normalizeNonTeachingForm(
    item.form || item.payload || {},
    item,
    role,
  );
  const staffEmail = emailKey(firstNonEmpty(
    item.email,
    item.staff_email,
    item.staffEmail,
    form.info?.email,
  ));
  const ay = academicYear(firstNonEmpty(item.academicYear, item.academic_year, form.info?.ay));
  const name = firstNonEmpty(item.name, item.full_name, item.fullName, form.info?.name, staffEmail);
  const status = firstNonEmpty(item.status, form.status, NON_TEACHING_STATUS.DRAFT);
  const selfTotals = calculateNonTeachingTotals(form, "self");
  const roTotals = calculateNonTeachingTotals(form, "reporting_officer");
  const registrarTotals = calculateNonTeachingTotals(form, "registrar");
  const vcTotals = calculateNonTeachingTotals(form, "vc");

  return {
    ...item,
    id: firstNonEmpty(item.id, `${staffEmail}:${ay}`),
    email: staffEmail,
    staff_email: staffEmail,
    academicYear: ay,
    academic_year: ay,
    form: { ...form, status },
    name,
    employeeId: firstNonEmpty(item.employeeId, item.employee_id, form.info?.employeeId),
    designation: firstNonEmpty(item.designation, form.info?.designation, nonTeachingRoleLabel(role)),
    department: firstNonEmpty(item.department, form.info?.department),
    appraisalRole: role,
    appraisal_role: role,
    roleLabel: nonTeachingRoleLabel(role),
    avatar: item.avatar || initialsFor(name, staffEmail),
    avatarColor: item.avatarColor ||
      (role === "registrar" ? "#7c3aed" : role === "reporting_officer" ? "#0891b2" : "#1d4ed8"),
    status,
    selfTotal: n(firstNonEmpty(item.selfTotal, item.self_total, selfTotals.total)),
    roTotal: n(firstNonEmpty(item.roTotal, item.ro_total, roTotals.total)),
    registrarTotal: n(firstNonEmpty(item.registrarTotal, item.registrar_total, registrarTotals.total)),
    vcTotal: n(firstNonEmpty(item.vcTotal, item.vc_total, vcTotals.total)),
  };
};

const nonTeachingStatusIndex = (status) => [
  NON_TEACHING_STATUS.DRAFT,
  NON_TEACHING_STATUS.SUBMITTED,
  NON_TEACHING_STATUS.RO_REVIEWED,
  NON_TEACHING_STATUS.REGISTRAR_REVIEWED,
  NON_TEACHING_STATUS.VC_APPROVED,
].indexOf(status);

const nonTeachingReachedReviewer = (item = {}, reviewerRole) => {
  const expectedIndex = nonTeachingStatusIndex(expectedPendingStatus(reviewerRole));
  const currentIndex = nonTeachingStatusIndex(item.status);
  return expectedIndex >= 0 && currentIndex >= expectedIndex;
};

export const fetchNonTeachingQueueForRole = async ({
  reviewerRole,
  academicYear: ay,
} = {}) => {
  const role = normalizeNonTeachingRole(reviewerRole, reviewerRole);
  if (!role || role === "non_teaching_staff") return [];

  try {
    const params = {};
    if (ay) params.academic_year = ay;

    const items = await api.get("/non-teaching/subordinates", { params });
    return (items || [])
      .map(normalizeNonTeachingQueueItem)
      .filter((item) =>
        canReviewNonTeachingItem(item, role) &&
        nonTeachingReachedReviewer(item, role)
      );
  } catch (err) {
    throw new Error(err?.message || "Could not load non-teaching review queue.", { cause: err });
  }
};

export const primeFormForReviewer = (form = {}, reviewerRole) => {
  const role = normalizeNonTeachingRole(reviewerRole, reviewerRole);
  const nextForm = normalizeNonTeachingForm(form);

  const partBTarget =
    role === "vc" ? "vc" : role === "registrar" ? "reg" : "ro";

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

  const data = await api.put(
    `/non-teaching/review/${encodeURIComponent(staffEmail)}`,
    {
      academic_year: ay,
      payload: finalForm,
      status,
      remarks,
    },
  );

  return decorateNonTeachingRow(data || {}, {
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
  const docsFor = (key) =>
    (reportForm.docs?.[key] || [])
      .map(
        (file) =>
          `<a href="${escapeHtml(file.url)}" target="_blank">${escapeHtml(file.name || file.url)}</a>`,
      )
      .join("<br>") || "-";

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
