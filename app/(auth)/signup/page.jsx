"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const S = {
  page: {
    minHeight: "100vh", background: "#0B1929",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Barlow', sans-serif", padding: "24px",
  },
  card: {
    width: "100%", maxWidth: "440px",
    background: "#0f2135",
    border: "1px solid rgba(245,166,35,0.15)",
    padding: "48px 40px",
  },
  logo: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 900, fontSize: 24, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "#F0EDE8",
    marginBottom: 32, display: "block",
  },
  logoSpan: { color: "#F5A623" },
  heading: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700, fontSize: 28, letterSpacing: "0.04em",
    textTransform: "uppercase", color: "#F0EDE8", marginBottom: 8,
  },
  sub: { fontSize: 14, color: "#7a92a8", marginBottom: 32, lineHeight: 1.5 },
  label: {
    display: "block", fontSize: 11, letterSpacing: "0.15em",
    textTransform: "uppercase", color: "#7a92a8", marginBottom: 8,
    fontFamily: "'Barlow Condensed', sans-serif",
  },
  input: {
    width: "100%", background: "#0B1929",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "12px 14px", fontSize: 15,
    color: "#F0EDE8", outline: "none",
    fontFamily: "'Barlow', sans-serif",
    boxSizing: "border-box", marginBottom: 20,
  },
  btn: {
    width: "100%", background: "#F5A623", color: "#0B1929",
    border: "none", cursor: "pointer", padding: "14px",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700, fontSize: 15, letterSpacing: "0.12em",
    textTransform: "uppercase", marginTop: 8,
  },
  error: {
    background: "rgba(220,50,50,0.1)", border: "1px solid rgba(220,50,50,0.3)",
    color: "#ff6b6b", padding: "12px 14px", fontSize: 14, marginBottom: 20,
  },
  link: { fontSize: 13, color: "#7a92a8", marginTop: 24, textAlign: "center" },
  linkA: { color: "#F5A623", cursor: "pointer" },
};

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    fullName: "", email: "", password: "", companyName: ""
  });

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.fullName } }
      });
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error("Signup failed");
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({ name: form.companyName })
        .select().single();
      if (companyError) throw companyError;
      const { error: profileError } = await supabase
        .from("users")
        .insert({
          id: userId, company_id: company.id,
          full_name: form.fullName, email: form.email, role: "admin",
        });
      if (profileError) throw profileError;
      router.push("/onboarding");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Barlow:wght@300;400&display=swap" rel="stylesheet" />
      <div style={S.page}>
        <div style={S.card}>
          <span style={S.logo}>Z<span style={S.logoSpan}>LOG</span></span>
          <h1 style={S.heading}>Create your account</h1>
          <p style={S.sub}>14-day free trial. No card required.</p>
          {error && <div style={S.error}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <label style={S.label}>Your name</label>
            <input style={S.input} name="fullName" type="text"
              placeholder="John Smith" value={form.fullName}
              onChange={handleChange} required />
            <label style={S.label}>Company name</label>
            <input style={S.input} name="companyName" type="text"
              placeholder="Smith Building Ltd" value={form.companyName}
              onChange={handleChange} required />
            <label style={S.label}>Email address</label>
            <input style={S.input} name="email" type="email"
              placeholder="john@smithbuilding.co.uk" value={form.email}
              onChange={handleChange} required />
            <label style={S.label}>Password</label>
            <input style={S.input} name="password" type="password"
              placeholder="At least 8 characters" value={form.password}
              onChange={handleChange} required minLength={8} />
            <button style={S.btn} type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
          <p style={S.link}>
            Already have an account?{" "}
            <span style={S.linkA} onClick={() => router.push("/login")}>
              Sign in
            </span>
          </p>
        </div>
      </div>
    </>
  );
}