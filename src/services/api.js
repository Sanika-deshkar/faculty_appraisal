export const fetchFormData = async () => {
  // later: axios.get('/form')
  return JSON.parse(localStorage.getItem("formData")) || {};
};

export const saveFormData = async (data) => {
  // later: axios.post('/form', data)
  localStorage.setItem("formData", JSON.stringify(data));
};