import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
  if (!username || !password) {
    setError("Please enter username and password.");
    return;
  }

  setLoading(true);

  setTimeout(() => {
    setLoading(false);

    if (username === "faculty" && password === "1234") {
      setError("");
      navigate("/dashboard");  
    } else {
      setError("Invalid credentials. Please try again.");
    }

  }, 1000);
};

  return (
    <div style={s.wrap}>
      <div style={s.card}>

        {/* LEFT SIDE */}
        <div style={s.left}>
          <div style={s.logoBox}>
            <img src="/dypiu.jpeg" alt="DYPIU Logo" style={{ height: 60 }} />
          </div>
          <h2 style={s.heading}>D Y Patil International University, Akurdi, Pune.</h2>
          <p style={s.desc}>
            To Create a vibrant learning environment – fostering innovation and creativity,
            experiential learning, which is inspired by research, and focuses on regionally,
            nationally and globally relevant areas.
          </p>
        </div>

        {/* RIGHT SIDE */}
        <div style={s.right}>
          <h3 style={s.welcome}>Welcome! Please login to continue.</h3>

          {error && <div style={s.error}>{error}</div>}

          <input
            style={s.input}
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />

          <div style={{ position: "relative", marginBottom: 16 }}>
            <input
              style={{ ...s.input, marginBottom: 0, paddingRight: 38 }}
              type={showPw ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button style={s.eye} onClick={() => setShowPw(!showPw)}>👁</button>
          </div>

          <button style={s.btn} onClick={handleLogin} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>

          <div style={s.forgot}>Forgot password?</div>
        </div>

      </div>
    </div>
  );
}

const s = {
  wrap: { 
    minHeight: "100vh",
    background: "#b8d4e8", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center", 
    padding: 20 
},
  card: { 
    background: "rgba(40,50,65,0.9)", 
    borderRadius: 8, 
    display: "flex", 
    width: "100%", 
    maxWidth: 820 },
  left: { 
    flex: 1.2, 
    padding: "32px 28px", 
    color: "white" },
  logoBox: { 
    background: "white", 
    borderRadius: 6, 
    padding: "12px 16px", 
    display: "inline-block", 
    marginBottom: 24 },
  heading: { fontSize: 20, 
    fontWeight: 600, 
    color: "white", 
    marginBottom: 14 },
  desc: { 
    fontSize: 12, 
    color: "#ccc", 
    lineHeight: 1.6 },
  right: { flex: 1, 
    padding: "32px 28px", 
    borderLeft: "1px solid rgba(255,255,255,0.1)" },
  welcome: { 
    fontSize: 15, 
    fontWeight: 600, 
    color: "white", 
    marginBottom: 20 },
  input: { 
    width: "100%", 
    padding: "10px 14px", 
    border: "1px solid rgba(255,255,255,0.25)", 
    borderRadius: 4, 
    fontSize: 13, 
    marginBottom: 12, 
    boxSizing: "border-box" },
  btn: { width: "100%", 
    padding: 11, 
    background: "#1a6fe0", color: "white", border: "none", borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 12 },
  eye: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 },
  forgot: { fontSize: 12, color: "#bbb", textAlign: "right", cursor: "pointer", textDecoration: "underline" },
  error: { background: "rgba(220,50,50,0.2)", border: "1px solid rgba(220,50,50,0.5)", color: "#ffaaaa", padding: "8px 12px", borderRadius: 4, fontSize: 12, marginBottom: 12 },
};