import { Navigate } from "react-router-dom";
import Dashboard from "./Dashboard"; // Faculty
import HODDashboard from "./HODDashboard";
import CISRFacultyDashboard from "./CISRFacultyDashboard";
import CISRCenterHeadDashboard from "./CISRCenterHeadDashboard";
import NonTeachingStaffDashboard from "./NonTeachingStaffDashboard";
import ReportingOfficerDashboard from "./ReportingOfficerDashboard";
import RegistrarDashboard from "./RegistrarDashboard";
import DeanDashboard from "./DeanDashboard";
import NonEngineeringDeanDashboard from "./NonEngineeringDeanDashboard";
import DirectorDashboard from "./DirectorDashboard";
import VCDashboard from "./VCDashboard";
import MediaCommDashboard from "./MediaCommDashboard";
import DesignArtsDashboard from "./DesignArtsDashboard";
import { normalizeRole } from "../auth/session";
import { departmentHasHod, getDeanTrack } from "../utils/hierarchy";
import { DEAN_TRACKS, getSchoolKey, isCisrSchool } from "../constants/universityHierarchy";
import { FORM_TYPES, formTypeForSchool } from "../constants/formRouting";

function UnknownSchoolDashboard() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", fontFamily: "Georgia, serif", padding: 24 }}>
      <div style={{ maxWidth: 520, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 24, color: "#0f172a" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>School not recognized</h2>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
          Your profile does not have a valid school assigned. Please update your profile with one of the university schools before opening the appraisal workflow.
        </p>
      </div>
    </div>
  );
}

export default function RoleDashboard() {
  const role = normalizeRole(sessionStorage.getItem("role"), "");
  const school = sessionStorage.getItem("school") || "";
  const department = sessionStorage.getItem("department") || "";
  const formType = formTypeForSchool(getSchoolKey(school));

  sessionStorage.setItem("role", role);

  switch (role) {
    case "faculty":
      if (isCisrSchool(school)) return <CISRFacultyDashboard />;
      if (formType === FORM_TYPES.MEDIA_COMM) return <MediaCommDashboard fixedRole="faculty" />;
      if (formType === FORM_TYPES.DESIGN_ARTS) return <DesignArtsDashboard fixedRole="faculty" />;
      if (!formType) return <UnknownSchoolDashboard />;
      return <Dashboard />;

    case "center_head":
      if (!isCisrSchool(school)) return <UnknownSchoolDashboard />;
      return <CISRCenterHeadDashboard />;
    
    case "hod": {
      if (!formType) return <UnknownSchoolDashboard />;
      const hasHod = departmentHasHod(school, department);
      if (!hasHod) {
        // If school has no HOD, redirect HOD user to Director (though normally HOD wouldn't exist)
        // More importantly, this handles the routing if someone manually types the URL.
        return <DirectorDashboard />;
      }
      return <HODDashboard />;
    }

    case "director":
      if (formType === FORM_TYPES.MEDIA_COMM) return <MediaCommDashboard fixedRole="director" />;
      if (formType === FORM_TYPES.DESIGN_ARTS) return <DesignArtsDashboard fixedRole="director" />;
      if (!formType) return <UnknownSchoolDashboard />;
      return <DirectorDashboard />;
      
    case "dean":
      if (!formType) return <UnknownSchoolDashboard />;
      if (getDeanTrack({ school, department, designation: sessionStorage.getItem("designation") || "" }) === DEAN_TRACKS.NON_ENGINEERING) {
        return <NonEngineeringDeanDashboard />;
      }
      return <DeanDashboard />;
      
    case "vc":
      return <VCDashboard />;

    case "registrar":
      return <RegistrarDashboard />;

    case "reporting_officer":
      return <ReportingOfficerDashboard />;

    case "non_teaching_staff":
      return <NonTeachingStaffDashboard />;
      
    default:
      return <Navigate to="/login" />;
  }
}

