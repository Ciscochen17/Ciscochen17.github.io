import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('OAuth uses PKCE and persistent storage removes GitHub provider credentials',async()=>{
  const source=await readFile(new URL('../assets/auth.js',import.meta.url),'utf8');
  const values=new Map();let captured,loginOptions;
  const memory={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const browser={supabase:{createClient:(url,key,options)=>{
    captured=options;
    return {auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null},error:null}),signInWithOAuth:async options=>{loginOptions=options;return {error:null};}}};
  }}};
  const context=vm.createContext({window:browser,localStorage:memory,sessionStorage:memory,URL,URLSearchParams,AbortSignal,atob,location:{origin:'https://miaogemiao.xin',pathname:'/',search:''},fetch:async()=>({ok:true,json:async()=>({supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_public_test_only_123456'})})});
  vm.runInContext(source,context);
  await browser.SiteAuth.ready;
  assert.equal(captured.auth.flowType,'pkce');
  assert.equal(captured.auth.persistSession,true);
  captured.auth.storage.setItem('session',JSON.stringify({access_token:'site-session',refresh_token:'site-refresh',provider_token:'github-secret',provider_refresh_token:'github-refresh'}));
  assert.deepEqual(JSON.parse(values.get('session')),{access_token:'site-session',refresh_token:'site-refresh'});
  captured.auth.storage.setItem('pkce-verifier','plain-verifier');assert.equal(values.get('pkce-verifier'),'plain-verifier');
  await browser.SiteAuth.login('https://evil.example/steal');
  assert.equal(values.get('miaoge.login.returnTo'),'/admin/');
  assert.equal(loginOptions.options.scopes,'public_repo');
  assert.equal(loginOptions.options.redirectTo,'https://miaogemiao.xin/admin/');
});
