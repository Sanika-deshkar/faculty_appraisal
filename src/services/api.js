import axios from "axios";
import { FACULTY_LIST, HOD_LIST, DIRECTOR_LIST, DEAN_LIST } from "../data/mockData";
import { SCHOOL_CONFIG } from "../constants/formConfig";

const DEFAULT_API_BASE_URL = "https://fastapi-backend-376777978967.us-central1.run.app/api/v1";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("supabaseToken") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token");

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const api = {
  get: (url, config) => apiClient.get(url, config).then((response) => response.data),
  post: (url, data, config) => apiClient.post(url, data, config).then((response) => response.data),
  put: (url, data, config) => apiClient.put(url, data, config).then((response) => response.data),
  delete: (url, config) => apiClient.delete(url, config).then((response) => response.data),
};

export const createFormData = (fields = {}, file) => {
  const formData = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, value);
    }
  });

  if (file) {
    formData.append("file", file);
  }

  return formData;
};

export const getFacultyForHOD = (hodDepartment, hodSchool) => {
  return FACULTY_LIST.filter(f => f.department === hodDepartment && f.school === hodSchool);
};

export const getStaffForDirector = (directorSchool) => {
  const hasHod = SCHOOL_CONFIG[directorSchool]?.hasHod ?? true;
  const faculty = FACULTY_LIST.filter(f => f.school === directorSchool);
  
  // If school has no HOD, director sees faculty pending approval directly
  // Otherwise, director might only see them after HOD review (or all of them)
  // For now, let's return all faculty and HODs in that school
  const hods = HOD_LIST.filter(h => h.school === directorSchool);
  
  return { faculty, hods: hasHod ? hods : [] };
};

export const getStaffForDean = (deanSchool) => {
  const faculty = FACULTY_LIST.filter(f => f.school === deanSchool);
  const hods = HOD_LIST.filter(h => h.school === deanSchool);
  const directors = DIRECTOR_LIST.filter(d => d.school === deanSchool);
  
  return { faculty, hods, directors };
};

export const getStaffForVC = () => {
  return {
    faculty: FACULTY_LIST,
    hods: HOD_LIST,
    directors: DIRECTOR_LIST,
    deans: DEAN_LIST
  };
};

export const fetchFormData = async () => {
  return JSON.parse(localStorage.getItem("formData")) || {};
};

export const saveFormData = async (data) => {
  localStorage.setItem("formData", JSON.stringify(data));
};
