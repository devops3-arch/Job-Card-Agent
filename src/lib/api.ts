// Centralized authenticated fetch wrapper.
// - Adds Authorization: Bearer <token> header automatically.
// - On 401, clears credentials and redirects to /auth.

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem("authToken");
    const headers = new Headers(init.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const isFormData = init.body instanceof FormData;
    const isUrlSearchParams = init.body instanceof URLSearchParams;
    if (init.body && !headers.has("Content-Type") && !isFormData && !isUrlSearchParams) {
        headers.set("Content-Type", "application/json");
    }

    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const res = await fetch(url, { ...init, headers });

    if (res.status === 401) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        if (window.location.pathname !== "/auth") {
            window.location.href = "/auth";
        }
    }
    return res;
}
