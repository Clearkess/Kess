const API = localStorage.getItem('SIM_API') || '/api';
async function api(path, options = {}) {
  const headers = {'Content-Type':'application/json', ...(options.headers||{})};
  const token = localStorage.getItem('sim_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(API + path, {...options, headers});
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}