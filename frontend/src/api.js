const API_ROOT = (process.env.REACT_APP_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const BASE = `${API_ROOT}/api`;

async function readJson(res, fallbackMessage) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || fallbackMessage;
    throw new Error(typeof detail === "string" ? detail : fallbackMessage);
  }
  return data;
}

export function apiRoot() {
  return API_ROOT;
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return readJson(res, "Invalid credentials");
}

export async function fetchHealth() {
  const res = await fetch(`${API_ROOT}/health`);
  return readJson(res, "Engine unreachable");
}

export async function fetchFlows() {
  const res = await fetch(`${BASE}/flows`);
  return readJson(res, "Failed to fetch flows");
}

export async function fetchAlerts() {
  const res = await fetch(`${BASE}/alerts`);
  return readJson(res, "Failed to fetch alerts");
}

export async function ackAlert(id) {
  const res = await fetch(`${BASE}/alerts/${id}/ack`, {
    method: "PATCH",
  });
  return readJson(res, "Failed to acknowledge alert");
}

export async function fetchIntel() {
  const res = await fetch(`${BASE}/intel`);
  return readJson(res, "Failed to fetch intel");
}

export async function submitFlow(flowData) {
  const res = await fetch(`${BASE}/flows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(flowData),
  });
  return readJson(res, "Failed to analyze flow");
}

export async function simulateTraffic(scenario = "flood") {
  const name =
    typeof scenario === "string"
      ? scenario
      : scenario?.scenario || "flood";
  const res = await fetch(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: name }),
  });
  return readJson(res, "Simulation failed");
}

export async function blockAlert(id) {
  const res = await fetch(`${BASE}/alerts/${id}/block`, { method: "POST" });
  return readJson(res, "Failed to block IP");
}

export async function clearData() {
  const res = await fetch(`${BASE}/data`, { method: "DELETE" });
  return readJson(res, "Failed to clear database");
}

export async function uploadPcap(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}/analyze-pcap`, { method: "POST", body: formData });
  return readJson(res, "PCAP analysis failed");
}