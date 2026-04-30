import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./components/Login";          
import AppraisalForm from "./components/AppraisalForm";  
import Dashboard from "./components/Dashboard";
import S from "./components/S";


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/form" element={<AppraisalForm />} />
        <Route path='/dashboard' element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;