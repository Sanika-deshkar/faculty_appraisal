import { Navigate } from "react-router-dom";
import Dashboard from "./Dashboard"; // Faculty
import HODDashboard from "./HODDashboard";
import DeanDashboard from "./DeanDashboard";
import DirectorDashboard from "./DirectorDashboard";
import VCDashboard from "./VCDashboard";
import MediaCommDashboard from "./MediaCommDashboard";
import { normalizeRole } from "../auth/session";
import { departmentHasHod } from "../utils/hierarchy";
import { getSchoolKey } from "../constants/universityHierarchy";

export default function RoleDashboard() {
  const role = normalizeRole(localStorage.getItem("role"), "");
  const school = localStorage.getItem("school") || "";
  const department = localStorage.getItem("department") || "";
  const isMediaCommSchool = getSchoolKey(school) === "SoMCS";

  localStorage.setItem("role", role);

  switch (role) {
    case "faculty":
      if (isMediaCommSchool) return <MediaCommDashboard fixedRole="faculty" />;
      return <Dashboard />;
    
    case "hod": {
      const hasHod = departmentHasHod(school, department);
      if (!hasHod) {
        // If school has no HOD, redirect HOD user to Director (though normally HOD wouldn't exist)
        // More importantly, this handles the routing if someone manually types the URL.
        return <DirectorDashboard />;
      }
      return <HODDashboard />;
    }

    case "director":
      if (isMediaCommSchool) return <MediaCommDashboard fixedRole="director" />;
      return <DirectorDashboard />;
      
    case "dean":
      if (isMediaCommSchool) return <MediaCommDashboard fixedRole="dean" />;
      return <DeanDashboard />;
      
    case "vc":
      return <VCDashboard />;
      
    default:
      return <Navigate to="/login" />;
  }
}
