/* GitHub OAuth through Supabase. GitHub provider tokens never persist locally. */
(() => {
  const OWNER = '80182649';
  const listeners = new Set();
  const state = { configured: false, owner: false, connected: false, session: null, error: '', config: null };
  let client;
  const emit = () => listeners.forEach(fn => fn(state));
  const identityId = user => {
    const github = user?.identities?.find(identity => identity.provider === 'github');
    return String(github?.identity_data?.provider_id || github?.identity_data?.sub || github?.id || '');
  };
  const setSession = session => { state.session = session; state.owner = identityId(session?.user) === OWNER; };

  // Persist only the Supabase session needed for automatic refresh. The provider
  // token is sent once to the authenticated Edge Function and encrypted there.
  const storage = {
    getItem: key => localStorage.getItem(key),
    setItem(key, value) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          delete parsed.provider_token;
          delete parsed.provider_refresh_token;
          value = JSON.stringify(parsed);
        }
      } catch { /* The PKCE verifier is a plain string, not a session. */ }
      localStorage.setItem(key, value);
    },
    removeItem: key => localStorage.removeItem(key),
  };
  const safeReturnTo = path => {
    try {
      const target = new URL(path || '/admin/', location.origin);
      return target.origin === location.origin && /^\/(diary|admin)\//.test(target.pathname) ? target.pathname + target.search : '/admin/';
    } catch { return '/admin/'; }
  };
  async function api(route, options = {}) {
    if (!client) throw Error('登录服务尚未完成一次性配置。');
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw Error('请先使用 GitHub 登录。');
    const response = await fetch(`${state.config.supabaseUrl}/functions/v1/github-publish${route}`, {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: state.config.publishableKey, 'Content-Type': 'application/json' },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store', signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(result.error || '发布服务连接失败，请稍后重试。');
      failure.code = result.code;
      failure.status = response.status;
      if (result.code === 'RECONNECT') { state.connected = false; emit(); }
      throw failure;
    }
    return result;
  }
  async function status() {
    if (!state.owner) { state.connected = false; return state; }
    const result = await api('/status');
    state.connected = result.connected;
    emit();
    return state;
  }
  async function login(returnTo = '/admin/') {
    if (!client) throw Error('请先完成登录服务的一次性配置。');
    sessionStorage.setItem('miaoge.login.returnTo', safeReturnTo(returnTo));
    const { error } = await client.auth.signInWithOAuth({
      provider: 'github',
      options: { scopes: 'public_repo', redirectTo: `${location.origin}/admin/` },
    });
    if (error) throw error;
  }
  async function logout() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    setSession(null); state.connected = false; state.error = ''; emit();
  }
  async function initialize() {
    try {
      const response = await fetch('/data/auth.json', { cache: 'no-store' });
      if (!response.ok) throw Error('无法读取登录配置，请稍后重试。');
      const config = await response.json();
      if (!config.supabaseUrl || !config.publishableKey) return state;
      const url = new URL(config.supabaseUrl);
      if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error('Supabase 项目地址格式不正确。');
      if (typeof config.publishableKey !== 'string' || config.publishableKey.startsWith('sb_secret_')) throw Error('前端配置只能使用 Publishable key 或 anon key。');
      if (!config.publishableKey.startsWith('sb_publishable_')) {
        try { const payload = JSON.parse(atob(config.publishableKey.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))); if (payload.role !== 'anon') throw Error(); }
        catch { throw Error('前端配置不是有效的 Publishable key 或 anon key。'); }
      }
      state.config = { supabaseUrl: url.origin, publishableKey: config.publishableKey };
      state.configured = true;
      if (!window.supabase?.createClient) throw Error('登录组件加载失败，请刷新重试。');
      client = window.supabase.createClient(url.origin, config.publishableKey, {
        auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storage, storageKey: 'miaoge.auth.session' },
      });
      client.auth.onAuthStateChange((event, session) => {
        setSession(session);
        if (event === 'SIGNED_OUT') state.connected = false;
        emit();
      });
      const params = new URLSearchParams(location.search);
      const callback = location.pathname.replace(/index\.html$/, '') === '/admin/';
      if (callback && (params.has('code') || params.has('error'))) {
        const code = params.get('code');
        const providerError = params.get('error_description');
        const flowId = params.get('sb_flow_id');
        history.replaceState(null, '', '/admin/');
        if (!code) throw Error(providerError || 'GitHub 登录未完成，请重试。');
        const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
        if (error || !data.session) throw Error('登录回调已过期或来自另一个浏览器，请重新登录。');
        setSession(data.session);
        if (!state.owner) { await logout(); throw Error('只有站主 Ciscochen17 可以进入发布管理。'); }
        if (data.session.provider_token) await api('/connect', { method: 'POST', body: { providerToken: data.session.provider_token } });
        await status();
        const returnTo = safeReturnTo(sessionStorage.getItem('miaoge.login.returnTo'));
        sessionStorage.removeItem('miaoge.login.returnTo');
        if (state.connected && returnTo !== '/admin/') { location.replace(returnTo); return state; }
      } else {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        setSession(data.session);
        if (state.session && !state.owner) { await logout(); throw Error('当前 GitHub 账号不是站主，无法发布。'); }
        if (state.owner) await status();
      }
    } catch (error) { state.error = error.message || '登录服务暂时不可用。'; }
    emit();
    return state;
  }
  window.SiteAuth = { state, api, login, logout, status, onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  window.SiteAuth.ready = initialize();
})();
