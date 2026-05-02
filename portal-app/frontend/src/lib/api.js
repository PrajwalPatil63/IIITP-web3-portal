import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

export const apiGet = (path, params) => api.get(path, { params }).then((r) => r.data);
export const apiPost = (path, body) => api.post(path, body).then((r) => r.data);

export default api;
