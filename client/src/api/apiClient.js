import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
  timeout: 10000,
});
client.interceptors.response.use(
  (response) => response.data.data,
  (error) =>
    Promise.reject(
      new Error(error.response?.data?.error?.message ?? error.message),
    ),
);
export default client;
