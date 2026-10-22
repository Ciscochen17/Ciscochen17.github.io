/* Managed publishing endpoint. All authorization is enforced server-side. */
export const OWNER_ID = '80182649';
const REPO = 'Ciscochen17/Ciscochen17.github.io';
const FILE = 'data/diary.json';
const BRANCH = 'main';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

class Failure extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function fail(status, code, message) { throw new Failure(status, code, message); }
function encode(bytes) { return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')); }
function decode(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }
const b64Text = text => encode(encoder.encode(text));
const fromB64Text = text => decoder.decode(decode(text.replace(/\s/g, '')));
const allowedOrigins = env => (env.allowedOrigins || 'https://miaogemiao.xin').split(',').map(s => s.trim());

export async function sealToken(token, env) {
  const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(`miaoge:github:v1:${env.supabaseUrl}:${env.serviceKey}`));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(token));
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}
async function openToken(value, env) {
  try {
    const [version, iv, data] = value.split('.');
    if (version !== 'v1') throw Error('version');
    const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(`miaoge:github:v1:${env.supabaseUrl}:${env.serviceKey}`));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    return decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) }, key, decode(data)));
  } catch { fail(401, 'RECONNECT', 'GitHub 连接已失效，请重新登录授权。'); }
}
export async function entryRevision(entry) {
  const value = entry ? [entry.title, entry.body] : null;
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === value && +value.slice(0, 4) >= 1900 && +value.slice(0, 4) <= 2100;
}
function validateEntries(value) {
  if (!Array.isArray(value)) fail(502, 'INVALID_DATA', '仓库日记数据格式无效，请先修复。');
  const seen = new Set();
  for (const e of value) {
    if (!e || !validDate(e.date) || typeof e.title !== 'string' || typeof e.body !== 'string' || seen.has(e.date)) fail(502, 'INVALID_DATA', '仓库日记数据格式无效或日期重复。');
    seen.add(e.date);
  }
  return value;
}
async function jsonBody(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) fail(415, 'CONTENT_TYPE', '请使用 JSON 请求。');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'INVALID_BODY', '请求内容为空。');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 350000) { await reader.cancel(); fail(413, 'TOO_LARGE', '单篇日记过长，请缩短后重试。'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(decoder.decode(bytes)); }
  catch { fail(400, 'INVALID_BODY', '请求不是有效的 JSON。'); }
}
async function requestJSON(fetcher, url, options) {
  let response;
  try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000) }); }
  catch { fail(502, 'UPSTREAM_UNAVAILABLE', '服务暂时无法连接，请稍后重试。'); }
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { response, data };
}
async function authenticate(request, env, fetcher) {
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer \S+$/.test(authorization)) fail(401, 'SIGN_IN', '请先使用 GitHub 登录。');
  const { response, data: user } = await requestJSON(fetcher, `${env.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: env.anonKey, Authorization: authorization },
  });
  if (!response.ok || !user?.id) fail(401, 'SIGN_IN', '登录已过期，请重新登录。');
  const identity = user.identities?.find(identity => identity.provider === 'github');
  const githubId = identity?.identity_data?.provider_id || identity?.identity_data?.sub || identity?.id;
  if (String(githubId) !== OWNER_ID) fail(403, 'OWNER_ONLY', '只有站主 Ciscochen17 可以发布内容。');
  return user;
}
async function connection(env, user, fetcher, method = 'GET', record) {
  const query = method === 'POST' ? '?on_conflict=user_id' : `?user_id=eq.${encodeURIComponent(user.id)}&select=encrypted_token,github_id`;
  const { response, data } = await requestJSON(fetcher, `${env.supabaseUrl}/rest/v1/site_github_connections${query}`, {
    method,
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    ...(record ? { body: JSON.stringify(record) } : {}),
  });
  if (!response.ok) fail(503, 'STORAGE_SETUP', '发布服务的凭据存储尚未配置，请完成数据库初始化。');
  return method === 'GET' && Array.isArray(data) ? data[0] : null;
}
async function github(env, token, fetcher, path, options = {}) {
  const result = await requestJSON(fetcher, `https://api.github.com${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'miaoge-site-publisher', 'Content-Type': 'application/json', ...options.headers },
  });
  if (result.response.status === 401) fail(401, 'RECONNECT', 'GitHub 授权已失效，请重新登录。');
  if (result.response.status === 403 || result.response.status === 429) fail(403, 'GITHUB_PERMISSION', 'GitHub 权限不足或请求过于频繁，请检查 public_repo 授权后重试。');
  return result;
}
async function connectedToken(env, user, fetcher) {
  const row = await connection(env, user, fetcher);
  if (!row?.encrypted_token || String(row.github_id) !== OWNER_ID) fail(401, 'RECONNECT', '请重新使用 GitHub 登录，以连接发布权限。');
  return openToken(row.encrypted_token, env);
}
async function readDiary(env, token, fetcher) {
  const endpoint = `/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`;
  const { response, data } = await github(env, token, fetcher, endpoint);
  if (response.status === 404) fail(404, 'FILE_MISSING', '找不到日记数据文件，请检查网站仓库。');
  if (!response.ok || !data?.sha) fail(502, 'GITHUB_READ', '读取 GitHub 日记失败，请稍后重试。');
  let entries;
  try {
    if (data.content && data.encoding === 'base64') entries = JSON.parse(fromB64Text(data.content));
    else {
      const raw = await github(env, token, fetcher, endpoint, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (!raw.response.ok) throw Error('raw');
      entries = raw.data;
    }
  } catch { fail(502, 'INVALID_DATA', '日记文件无法解析，请检查仓库中的 JSON。'); }
  return { entries: validateEntries(entries), sha: data.sha };
}
async function updateDiary(request, env, token, fetcher) {
  const input = await jsonBody(request);
  if (!input || !validDate(input.date) || typeof input.baseRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.baseRevision)) fail(400, 'INVALID_ENTRY', '日记日期或版本无效，请刷新后重试。');
  const removing = request.method === 'DELETE';
  if (!removing && (typeof input.title !== 'string' || typeof input.body !== 'string' || !input.title.trim() || !input.body.trim() || input.title.length > 200 || input.body.length > 100000)) fail(400, 'INVALID_ENTRY', '请填写标题与正文；标题限 200 字，正文限 10 万字符。');
  // Re-read and merge once on a GitHub file conflict. Different dates can merge;
  // a changed entry on the same date is never overwritten silently.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { entries, sha } = await readDiary(env, token, fetcher);
    const previous = entries.find(e => e.date === input.date);
    // A retry after a lost success response is safe when remote text is already
    // identical, even if the caller still has the older revision.
    if (!removing && previous?.title === input.title && previous?.body === input.body) return { entry: previous, baseRevision: await entryRevision(previous), unchanged: true, commit: null };
    if (await entryRevision(previous) !== input.baseRevision) fail(409, 'ENTRY_CONFLICT', '这篇日记已在其他设备修改，请保留当前文字并刷新后重新编辑。');
    if (removing && !previous) fail(404, 'ENTRY_MISSING', '这一天还没有公开日记。');
    const entry = removing ? null : { date: input.date, title: input.title, body: input.body, updated: new Date().toISOString() };
    const next = entries.filter(e => e.date !== input.date);
    if (entry) next.push(entry);
    next.sort((a, b) => b.date.localeCompare(a.date));
    const { response, data } = await github(env, token, fetcher, `/repos/${REPO}/contents/${FILE}`, {
      method: 'PUT', body: JSON.stringify({ message: `${removing ? 'Remove' : 'Publish'} diary ${input.date}`, content: b64Text(JSON.stringify(next, null, 2) + '\n'), sha, branch: BRANCH }),
    });
    if (response.status === 409) continue;
    if (!response.ok || !data?.commit?.sha) fail(502, 'GITHUB_WRITE', 'GitHub 提交失败，内容未确认发布，请保留文字并重试。');
    return { entry, baseRevision: await entryRevision(entry), unchanged: false, commit: { sha: data.commit.sha, url: `https://github.com/${REPO}/commit/${data.commit.sha}` } };
  }
  fail(409, 'REPOSITORY_BUSY', '仓库正在更新，请稍后重试，当前文字没有被覆盖。');
}
export async function handleRequest(request, env, fetcher = fetch) {
  const origin = request.headers.get('Origin') || '';
  const permitted = allowedOrigins(env).includes(origin);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' };
  if (permitted) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' });
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  try {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^.*\/github-publish/, '') || '/';
    if (route === '/health' && request.method === 'GET') return reply({ configured: Boolean(env.supabaseUrl && env.anonKey && env.serviceKey) });
    if (!permitted) fail(403, 'ORIGIN', '此来源不允许调用发布服务。');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!env.supabaseUrl || !env.anonKey || !env.serviceKey) fail(503, 'NOT_CONFIGURED', '发布服务尚未完成配置。');
    if (!['/status', '/connect', '/diary'].includes(route)) fail(404, 'NOT_FOUND', '没有这个发布接口。');
    const user = await authenticate(request, env, fetcher);
    if (route === '/connect' && request.method === 'POST') {
      const input = await jsonBody(request);
      if (!input || typeof input.providerToken !== 'string' || input.providerToken.length < 10 || input.providerToken.length > 2000) fail(400, 'PROVIDER_TOKEN', '未收到 GitHub 授权，请重新登录。');
      const { response, data: profile } = await github(env, input.providerToken, fetcher, '/user');
      if (!response.ok || String(profile?.id) !== OWNER_ID) fail(403, 'OWNER_ONLY', 'GitHub 授权账号与站主不匹配。');
      const { response: repoResponse, data: repo } = await github(env, input.providerToken, fetcher, `/repos/${REPO}`);
      if (!repoResponse.ok || repo?.permissions?.push !== true) fail(403, 'GITHUB_PERMISSION', '当前 GitHub 授权无法写入网站仓库。');
      const scopes = response.headers.get('X-OAuth-Scopes');
      if (scopes !== null && !scopes.split(/,\s*/).some(s => s === 'public_repo' || s === 'repo')) fail(403, 'GITHUB_PERMISSION', '缺少公开仓库发布权限，请重新授权。');
      await connection(env, user, fetcher, 'POST', { user_id: user.id, github_id: Number(OWNER_ID), encrypted_token: await sealToken(input.providerToken, env), updated_at: new Date().toISOString() });
      return reply({ connected: true, login: 'Ciscochen17' });
    }
    if (route === '/status' && request.method === 'GET') {
      const row = await connection(env, user, fetcher);
      return reply({ connected: Boolean(row?.encrypted_token && String(row.github_id) === OWNER_ID), login: 'Ciscochen17' });
    }
    const token = await connectedToken(env, user, fetcher);
    if (route === '/diary' && request.method === 'GET') {
      const { entries } = await readDiary(env, token, fetcher);
      const date = url.searchParams.get('date');
      if (date !== null && !validDate(date)) fail(400, 'INVALID_DATE', '日记日期无效。');
      const entry = entries.find(e => e.date === date) || null;
      return reply({ entries, entry, ...(date ? { baseRevision: await entryRevision(entry) } : {}) });
    }
    if (route === '/diary' && ['PUT', 'DELETE'].includes(request.method)) return reply(await updateDiary(request, env, token, fetcher));
    fail(405, 'METHOD', '不支持此操作。');
  } catch (error) {
    if (error instanceof Failure) return reply({ error: error.message, code: error.code }, error.status);
    // Never return upstream bodies, bearer tokens, or secret keys.
    return reply({ error: '发布服务暂时出现问题，请保留文字并稍后重试。', code: 'SERVER_ERROR' }, 500);
  }
}
