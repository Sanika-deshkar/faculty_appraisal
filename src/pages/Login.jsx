import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { APP_INFO } from "../constants/formConfig";
import { CREDENTIALS } from "../data/mockData";
import { supabase } from "../services/supabase";
import { buildProfilePayload, normalizeRole, storeUserSession } from "../auth/session";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState(""); // This will be treated as email for Supabase
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const email = username.trim().toLowerCase();

      // 1. Attempt Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: password,
      });

      if (!authError && data?.user) {
        console.log("Supabase login successful:", data.user);

        const { data: profile, error: profileError } = await supabase
          .from("faculty_profiles")
          .select("*")
          .eq("email", data.user.email || email)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        let activeProfile = profile;

        if (!activeProfile) {
          const metadata = data.user.user_metadata || {};
          const fallbackProfile = buildProfilePayload({
            email: data.user.email || email,
            employeeId: metadata.employeeId || metadata.employee_id || "",
            name: metadata.name || metadata.full_name || data.user.email || email,
            qualification: metadata.qualification || "",
            designation: metadata.designation || "",
            department: metadata.department || "",
            school: metadata.school || "",
            experience: metadata.experience || metadata.teaching_experience || "",
            phone: metadata.phone || "",
            role: normalizeRole(metadata.role),
          }, APP_INFO.DEFAULT_AY);

          const { data: createdProfile, error: createProfileError } = await supabase
            .from("faculty_profiles")
            .upsert(fallbackProfile, { onConflict: "email" })
            .select()
            .single();

          if (createProfileError) {
            console.warn("Could not create missing faculty profile:", createProfileError.message);
          } else {
            activeProfile = createdProfile;
          }
        }

        storeUserSession({
          session: data.session,
          user: data.user,
          profile: activeProfile,
          fallbackEmail: email,
        });

        navigate("/dashboard", { replace: true });
        return;
      }

      // 2. Fallback to Mock Data (useful during development/migration)
      console.warn("Supabase auth failed, trying mock fallback...", authError?.message);
      const cred = CREDENTIALS[email];

      if (cred && cred.password === password) {
        storeUserSession({
          profile: {
            email,
            full_name: cred.name || email,
            appraisal_role: cred.role,
            school: cred.school,
            department: cred.department,
            designation: cred.designation,
            employee_id: cred.employeeId,
          },
          fallbackEmail: email,
        });

        navigate("/dashboard", { replace: true });
        return;
      }

      // 3. Fallback to SQL-seeded development users.
      const { data: devUsers, error: devLoginError } = await supabase.rpc("dev_login", {
        p_email: email,
        p_password: password,
      });

      if (devLoginError) {
        console.warn("Dev login fallback failed:", devLoginError.message);
      }

      const devProfile = Array.isArray(devUsers) ? devUsers[0] : null;
      if (devProfile) {
        storeUserSession({
          profile: devProfile,
          fallbackEmail: email,
        });

        navigate("/dashboard", { replace: true });
      } else {
        setError(authError?.message || "Invalid credentials. Please try again.");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  const handleForgotPassword = async () => {
    const email = username.trim();

    if (!email) {
      setError("Please enter your email above, then click Forgot password.");
      setMessage("");
      return;
    }

    setResetLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setMessage("Password reset link sent. Please check your email.");
    } catch (err) {
      console.error("Password reset error:", err);
      setError("Unable to send reset link. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      <style>{`
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; }

  .dyp-input {
    width: 100%;
    padding: 11px 14px;
    border: 1.5px solid rgba(255,255,255,0.55);
    border-radius: 4px;
    font-size: 14px;
    color: white;
    background: rgba(255,255,255,0.08);
    margin-bottom: 14px;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none;
  }
  .dyp-input::placeholder { color: rgba(255,255,255,0.5); }
  .dyp-input:focus {
    border-color: white;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.15);
  }
  .dyp-btn {
    width: 100%;
    padding: 12px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.2s;
    margin-bottom: 12px;
    letter-spacing: 0.2px;
  }
  .dyp-btn:hover:not(:disabled) { background: #1d4ed8; }
  .dyp-btn:disabled { opacity: 0.72; cursor: not-allowed; }
  .dyp-forgot {
    background: none;
    border: none;
    font-size: 13px;
    color: rgba(255,255,255,0.75);
    cursor: pointer;
    font-family: inherit;
    padding: 0;
    text-align: center;
    width: 100%;
    transition: color 0.2s;
  }
  .dyp-forgot:hover:not(:disabled) { color: white; text-decoration: underline; }
  .dyp-forgot:disabled { opacity: 0.65; }
`}</style>

      <div style={s.wrap}>
        {/* Top Left Logo */}
        <img
          src="/image.png"
          alt="University Logo"
          style={s.topLeftLogo}
        />

        {/* Top Right Logo */}
        <img
          src="/IQAS.png"
          alt="IQAC Logo"
          style={s.topRightLogo}
        />

        <div style={s.overlay} />

        {/* ── Wide Card ── */}
        <div style={s.card}>

          {/* ════ LEFT ════ */}
          <div style={s.left}>
            <h1 style={s.uniName}>
              D Y Patil International University, Akurdi, Pune.
            </h1>

            <p style={s.desc}>
              To Create a vibrant learning environment – fostering innovation and creativity,
              experiential learning, which is inspired by research, and focuses on regionally,
              nationally and globally relevant areas.
            </p>
          </div>

          {/* ════ RIGHT: Login panel ════ */}
          <div style={s.right}>
            <h2 style={s.panelTitle}>Welcome! Please login to continue.</h2>

            {error && <div style={s.error}>{error}</div>}
            {message && <div style={s.success}>{message}</div>}

            <input
              className="dyp-input"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="username"
            />

            <div style={{ position: "relative", marginBottom: 2 }}>
              <input
                className="dyp-input"
                style={{ marginBottom: 0, paddingRight: 44 }}
                type={showPw ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="current-password"
              />
              <button
                style={s.eyeBtn}
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "" : "👁"}
              </button>
            </div>

            <div style={{ marginBottom: 16 }} />

            <button className="dyp-btn" onClick={handleLogin} disabled={loading}>
              {loading ? "Signing in…" : "Login"}
            </button>

            <button className="dyp-forgot" onClick={handleForgotPassword} disabled={resetLoading}>
              {resetLoading ? "Sending reset link..." : "Forgot password?"}
            </button>

            <p style={s.signupText}>
              Don't have an account?{" "}
              <Link to="/signup" style={s.signupLink}>Sign up</Link>
            </p>
          </div>

        </div>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  topLeftLogo: {
    position: "absolute",
    top: 20,
    left: 20,
    height: 100,
    zIndex: 2,
  },

  topRightLogo: {
    position: "absolute",
    top: 20,
    right: 20,
    height: 100,
    zIndex: 2,
  },

  wrap: {
    minHeight: "100vh",
    width: "100%",
    backgroundImage: "url('/dyp.jpeg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    position: "relative",
  },

  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(8, 16, 38, 0.30)",
    pointerEvents: "none",
  },

  card: {
    position: "relative",
    zIndex: 1,
    width: "65%",
    maxWidth: 1280,
    display: "flex",
    alignItems: "stretch",
    borderRadius: 8,
    background: "rgba(15, 25, 50, 0.72)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    overflow: "hidden",
    minHeight: 260,
  },

  left: {
    flex: 1,
    color: "white",
    padding: "24px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    justifyContent: "center",
  },

  uniName: {
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.3,
    color: "white",
  },

  desc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.8,
    margin: 0,
    maxWidth: 500,
  },

  right: {
    width: 320,
    flexShrink: 0,
    background: "transparent",
    borderLeft: "1px solid rgba(255,255,255,0.15)",
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  panelTitle: {
    fontSize: 15.5,
    fontWeight: 700,
    color: "white",
    marginBottom: 22,
    marginTop: 0,
    lineHeight: 1.45,
  },

  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    padding: 4,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 1,
  },

  signupText: {
    marginTop: 18,
    textAlign: "center",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
  },

  signupLink: {
    color: "#60a5fa",
    fontWeight: 600,
    textDecoration: "none",
  },

  error: {
    background: "rgba(185,28,28,0.25)",
    border: "1px solid rgba(252,165,165,0.5)",
    color: "#fca5a5",
    padding: "9px 12px",
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 1.5,
  },

  success: {
    background: "rgba(21,128,61,0.25)",
    border: "1px solid rgba(134,239,172,0.5)",
    color: "#86efac",
    padding: "9px 12px",
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 1.5,
  },
};
