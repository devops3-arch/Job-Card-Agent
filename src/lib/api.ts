export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const getDevAuthHeaders = (role: "engineer" | "manager" | "admin") => {
  const userId = role === "manager" ? "2" : role === "admin" ? "3" : "1";

  return {
    "X-DEV-USER-ID": userId,
    "X-DEV-USER-ROLE": role,
  };
};
