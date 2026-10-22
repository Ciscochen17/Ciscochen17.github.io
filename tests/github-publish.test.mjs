import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, entryRevision, sealToken } from '../supabase/functions/github-publish/handler.mjs';

const env = { supabaseUrl: 'https://project.supabase.co', anonKey: 'public-test-key', serviceKey: 'server-test-key-not-a-credential', allowedOrigins: 'https://miaogemiao.xin' };
const user = { id: 'test-user', identities: [{ provider: 'github', identity_data: { provider_id: '80182649' } }] };
const response = (data, status = 200, headers = {}) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const request = (path, method = 'GET', body, headers = {}) => new Request(`https://project.supabase.co/functions/v1/github-publish${path}`, {
  method, headers: { Origin: 'https://miaogemiao.xin', Authorization: 'Bearer authenticated-session', 'Content-Type': 'application/json', ...headers },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const contents = (entries, sha = 'old-sha') => ({ sha, content: Buffer.from(JSON.stringify(entries)).toString('base64'), encoding: 'base64' });
async function fixture(entries = [], options = {}) {
  const encrypted = await sealToken('github-test-token', env);
  const calls = [], commits = [];
  let stored, reads = 0;
  const fetcher = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.endsWith('/auth/v1/user')) return response(options.user || user, options.authStatus || 200);
    if (url.includes('/rest/v1/')) {
      if (opts.method === 'POST') { stored = JSON.parse(opts.body); return response(null, 204); }
      return response(options.disconnected ? [] : [{ encrypted_token: encrypted, github_id: 80182649 }]);
    }
    if (url === 'https://api.github.com/user') return response({ id: options.providerUser || 80182649 }, 200, { 'X-OAuth-Scopes': 'public_repo' });
    if (url === 'https://api.github.com/repos/Ciscochen17/Ciscochen17.github.io') return response({ permissions: { push: true } });
    if (url.includes('/contents/data/diary.json')) {
      if (opts.method === 'PUT') {
        const commit = JSON.parse(opts.body);commits.push(commit);
        if(options.race && commits.length === 1)return response({},409);
        return response({ commit: { sha: 'b'.repeat(40) } });
      }
      reads++;
      return response(contents(options.race && reads > 1 ? [...entries, { date:'2026-10-20',title:'另一篇',body:'不要丢失' }] : entries, `sha-${reads}`));
    }
    throw Error(`Unexpected URL: ${url}`);
  };
  return { fetcher, calls, commits, stored: () => stored };
}

test('rejects unauthenticated requests and hostile origins before any upstream access', async () => {
  const never = () => { throw Error('must not fetch'); };
  let result = await handleRequest(request('/status', 'GET', null, { Origin: 'https://evil.example' }), env, never);
  assert.equal(result.status, 403);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
  const noAuth = request('/status');noAuth.headers.delete('Authorization');
  result = await handleRequest(noAuth, env, never);
  assert.equal(result.status, 401);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://miaogemiao.xin');
});

test('verifies the session with Auth and rejects non-owner identities', async () => {
  const f = await fixture([], { user: { ...user, identities: [{ provider:'github', identity_data:{ provider_id:'123' } }] } });
  const result = await handleRequest(request('/status'),env,f.fetcher);
  assert.equal(result.status,403);
  assert.equal(f.calls.length,1);
  const invalid = await fixture([],{authStatus:401});
  assert.equal((await handleRequest(request('/status'),env,invalid.fetcher)).status,401);
});

test('public health and CORS preflight never expose secrets', async () => {
  const never = () => { throw Error('must not fetch'); };
  const result = await handleRequest(request('/health'),env,never);
  assert.deepEqual(await result.json(),{configured:true});
  assert.equal((await handleRequest(request('/diary','OPTIONS'),env,never)).status,204);
});

test('connect checks both identities, encrypts the token, and never returns it',async()=>{
  const f=await fixture();
  const result=await handleRequest(request('/connect','POST',{providerToken:'github-test-token'}),env,f.fetcher);
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{connected:true,login:'Ciscochen17'});
  assert.match(f.stored().encrypted_token,/^v1\./);
  assert.ok(!JSON.stringify(f.stored()).includes('github-test-token'));
  const bad=await fixture([],{providerUser:123});
  assert.equal((await handleRequest(request('/connect','POST',{providerToken:'github-test-token'}),env,bad.fetcher)).status,403);
  assert.equal(bad.stored(),undefined);
});

test('session status returns no GitHub credential',async()=>{
  const f=await fixture();
  const result=await handleRequest(request('/status'),env,f.fetcher);
  assert.deepEqual(await result.json(),{connected:true,login:'Ciscochen17'});
});

test('publishes UTF-8 Markdown into only the configured repository/file',async()=>{
  const old={date:'2026-10-20',title:'旧日记',body:'保留我'};
  const f=await fixture([old]);
  const body={date:'2026-10-22',title:'今天',body:'## 日常\n\n**你好，世界**',baseRevision:await entryRevision(null),repo:'attacker/repo',path:'README.md'};
  const result=await handleRequest(request('/diary','PUT',body),env,f.fetcher);
  assert.equal(result.status,200);
  const parsed=await result.json();
  assert.equal(parsed.entry.body,body.body);
  assert.equal(parsed.commit.url,`https://github.com/Ciscochen17/Ciscochen17.github.io/commit/${'b'.repeat(40)}`);
  assert.equal(f.commits.length,1);
  assert.equal(f.commits[0].branch,'main');
  const saved=JSON.parse(Buffer.from(f.commits[0].content,'base64').toString('utf8'));
  assert.equal(saved[0].title,'今天');
  assert.deepEqual(saved[1],old);
  assert.ok(f.calls.filter(c=>c.opts.method==='PUT').every(c=>c.url==='https://api.github.com/repos/Ciscochen17/Ciscochen17.github.io/contents/data/diary.json'));
});

test('a same-date conflict never overwrites remote changes',async()=>{
  const f=await fixture([{date:'2026-10-22',title:'别处更新',body:'新版本'}]);
  const result=await handleRequest(request('/diary','PUT',{date:'2026-10-22',title:'旧页修改',body:'内容',baseRevision:await entryRevision(null)}),env,f.fetcher);
  assert.equal(result.status,409);
  assert.equal((await result.json()).code,'ENTRY_CONFLICT');
  assert.equal(f.commits.length,0);
});

test('retry merges a different-date commit instead of losing it',async()=>{
  const f=await fixture([],{race:true});
  const result=await handleRequest(request('/diary','PUT',{date:'2026-10-22',title:'今天',body:'内容',baseRevision:await entryRevision(null)}),env,f.fetcher);
  assert.equal(result.status,200);
  assert.equal(f.commits.length,2);
  const saved=JSON.parse(Buffer.from(f.commits[1].content,'base64').toString('utf8'));
  assert.equal(saved.length,2);
  assert.equal(saved[1].body,'不要丢失');
});

test('unchanged publishes are idempotent and do not trigger another build',async()=>{
  const entry={date:'2026-10-22',title:'今天',body:'内容'};
  const f=await fixture([entry]);
  const result=await handleRequest(request('/diary','PUT',{...entry,baseRevision:await entryRevision(entry)}),env,f.fetcher);
  assert.equal(result.status,200);
  assert.equal((await result.json()).unchanged,true);
  assert.equal(f.commits.length,0);
});

test('delete requires the current entry revision and preserves other dates',async()=>{
  const entry={date:'2026-10-22',title:'今天',body:'删除这条'};
  const other={date:'2026-10-20',title:'之前',body:'保留这条'};
  const f=await fixture([entry,other]);
  const result=await handleRequest(request('/diary','DELETE',{date:entry.date,baseRevision:await entryRevision(entry)}),env,f.fetcher);
  assert.equal(result.status,200);
  assert.deepEqual(JSON.parse(Buffer.from(f.commits[0].content,'base64').toString('utf8')),[other]);
});

test('retry after a lost success response is idempotent even with the old revision',async()=>{
  const entry={date:'2026-10-22',title:'已提交',body:'网络返回丢失后的重试'};
  const f=await fixture([entry]);
  const result=await handleRequest(request('/diary','PUT',{...entry,baseRevision:await entryRevision(null)}),env,f.fetcher);
  assert.equal(result.status,200);
  const data=await result.json();assert.equal(data.unchanged,true);
  assert.equal(data.baseRevision,await entryRevision(entry));assert.equal(f.commits.length,0);
});

test('invalid dates and empty posts never reach a GitHub commit',async()=>{
  for(const entry of [{date:'2026-02-30',title:'标题',body:'正文'},{date:'2026-10-22',title:'',body:'正文'}]){
    const f=await fixture();
    const result=await handleRequest(request('/diary','PUT',{...entry,baseRevision:await entryRevision(null)}),env,f.fetcher);
    assert.equal(result.status,400);assert.equal(f.commits.length,0);
  }
});

test('an owner without a GitHub connection must reauthorize',async()=>{
  const f=await fixture([],{disconnected:true});
  const result=await handleRequest(request('/diary'),env,f.fetcher);
  assert.equal(result.status,401);
  assert.equal((await result.json()).code,'RECONNECT');
});
