import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // TEMP until backend
  const [user, setUser] = useState({
    name: "Demo User",
    role: "faculty", // faculty | hod | dean | vc
    dept: "CSE",
    school: "Engineering"
  });

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);