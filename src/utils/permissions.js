
// ─── School HOD flag ──────────────────────────────────────────────────────────
// Returns true  → school has an HOD layer (Faculty → HOD → Director → ...)
// Returns false → no HOD layer (Faculty → Director → ...)
// The flag is written to sessionStorage by Login.jsx at sign-in time.
export const schoolHasHOD = () => sessionStorage.getItem("hasHOD") !== "false";

// ─── Field / score editing permissions ───────────────────────────────────────
export const canEditFacultyFields = (role) => role === "faculty";

export const canEditFacultyScore  = (role) => role === "faculty";
export const canEditHodScore      = (role) => role === "hod" && schoolHasHOD();
export const canEditDeanScore     = (role) => role === "director";
