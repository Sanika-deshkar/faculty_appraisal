export const FORM_TYPES = {
  DEFAULT: "FORM_A",
  MEDIA_COMM: "FORM_B",
  DESIGN_ARTS: "FORM_C",
};

export const FORM_SCHOOL_CODES = {
  [FORM_TYPES.DEFAULT]: ["SoCSEA", "SoBB", "SoCE", "SoEMR", "SoCM", "CISR"],
  [FORM_TYPES.MEDIA_COMM]: ["SoMCS"],
  [FORM_TYPES.DESIGN_ARTS]: ["SoD", "CioD", "SoAA"],
};

export const formTypeForSchool = (schoolCode) => {
  const code = String(schoolCode || "").trim();
  return Object.entries(FORM_SCHOOL_CODES).find(([, codes]) => codes.includes(code))?.[0] || "";
};

