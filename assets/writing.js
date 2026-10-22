/* Public diary reading and GitHub-authenticated publishing. No local drafts. */
async function renderDiaryCalendar() {
  await SiteAuth.ready;
  document.title = '日记 · 喵个喵';
  const initial = dateParts(today()); let year = initial[0], month = initial[1] - 1;
  if (SiteAuth.state.owner && SiteAuth.state.connected) {
    try { published = (await SiteAuth.api('/diary')).entries.sort((a,b)=>b.date.localeCompare(a.date)); }
    catch (error) { toast(error.message); }
  }
  $('#main').innerHTML = `<div class="wrap">${pageHead('01', 'DAILY JOURNAL', '日子，有迹可循。', '在日历上挑一天，看看过去，或者写下此刻。', `<strong>${String(published.length).padStart(2, '0')}</strong>篇公开日记`)}
    <div class="diary-layout"><section class="calendar-panel" aria-label="日记日历">
      <div class="calendar-top"><div class="calendar-month"><h2 id="month-label"></h2><span id="month-english"></span></div>
      <div class="calendar-controls"><button id="prev-month" class="icon-button" aria-label="上个月">${icon('left')}</button><input type="month" class="month-picker" id="month-picker" min="1900-01" max="2100-12" aria-label="选择年月"><button id="next-month" class="icon-button" aria-label="下个月">${icon('right')}</button><button id="this-month" class="button sm quiet">今天</button></div></div>
      <div class="calendar-week" aria-hidden="true">${['一','二','三','四','五','六','日'].map(d => `<span>${d}</span>`).join('')}</div>
      <div id="calendar-grid" class="calendar-grid" aria-labelledby="month-label"></div>
      <div class="calendar-legend"><span class="legend-item"><i class="legend-ring"></i>今天</span><span class="legend-item"><i class="legend-ring written"></i>已发布日记</span></div>
    </section><aside class="diary-side"><div><div class="side-date">${readableDate(today())} · ${weekday(today())}</div><h2>今天，发生了什么？</h2><p class="side-description">不必是特别的一天。<br>几句话，也值得被记住。</p><a class="button primary" href="${diaryURL(today())}">${icon('pen')}${SiteAuth.state.owner ? '写今天的日记' : '翻开今天'}</a></div>
    <div class="side-section"><h3>最近的记录 <span class="muted">/ ${published.length}</span></h3><div>${published.length ? published.slice(0,4).map(e => `<a class="entry-small" href="${diaryURL(e.date)}"><span>${e.date.replaceAll('-','.')}</span><strong>${escapeHTML(e.title || '未命名日记')}</strong></a>`).join('') : '<p class="empty-small">还没有公开记录。<br>从今天的第一句话开始吧。</p>'}</div></div>
    <div class="side-actions"><button class="button sm" id="export-all">${icon('download')}导出日记</button><a href="/admin/" class="button sm">${icon('pen')}站主管理</a></div></aside></div>
    <div class="notice diary-notice">${icon('info')}<span>这里的日记向所有人开放阅读。站主使用 GitHub 登录后，可以直接编辑和发布。</span></div><div class="diary-quote">“ 把一天天过成自己的样子。 ”</div></div>`;
  function render() {
    const first = new Date(year, month, 1, 12), offset = (first.getDay()+6)%7;
    const days = new Date(year, month+1, 0, 12).getDate(), count = Math.ceil((offset+days)/7)*7;
    $('#month-label').textContent = `${year} 年 ${month+1} 月`;
    $('#month-english').textContent = first.toLocaleDateString('en-US',{month:'long'}).toUpperCase();
    $('#month-picker').value = `${year}-${String(month+1).padStart(2,'0')}`;
    $('#prev-month').disabled = year === 1900 && month === 0;
    $('#next-month').disabled = year === 2100 && month === 11;
    $('#calendar-grid').innerHTML = Array.from({length:count},(_,i) => {
      const d = new Date(year, month, i-offset+1, 12), key = dateKey(d.getFullYear(),d.getMonth(),d.getDate());
      const entry = published.find(e => e.date === key);
      const label = `${readableDate(key)}，${key === today() ? '今天，' : ''}${entry ? '有公开日记' : '尚未记录'}`;
      return `<a class="calendar-day ${d.getMonth() !== month ? 'outside ' : ''}${key === today() ? 'today ' : ''}${entry ? 'written' : ''}" href="${diaryURL(key)}" aria-label="${label}" ${key === today() ? 'aria-current="date"' : ''}><span class="day-number">${d.getDate()}</span>${entry ? '<span class="day-dot"></span>' : ''}</a>`;
    }).join('');
  }
  function move(delta) { const d = new Date(year,month+delta,1,12); if(d.getFullYear()<1900||d.getFullYear()>2100)return; year=d.getFullYear();month=d.getMonth();render(); }
  $('#prev-month').onclick=()=>move(-1);$('#next-month').onclick=()=>move(1);
  $('#this-month').onclick=()=>{[year,month]=dateParts(today());month--;render();};
  $('#month-picker').onchange=e=>{ const [y,m] = e.target.value.split('-').map(Number); if(y>=1900&&y<=2100&&m>=1&&m<=12){year=y;month=m-1;render();} };
  $('#export-all').onclick=()=>{ if(!published.length)return toast('还没有公开日记可以导出');downloadFile(`miaoge-diary-${today()}.json`,JSON.stringify({version:1,entries:published},null,2),'application/json'); };
  render();
}

async function renderAdmin() {
  await SiteAuth.ready;
  document.title = '站主管理 · 喵个喵';
  const state = SiteAuth.state;
  let legacy=[];
  try { legacy=Object.entries(JSON.parse(localStorage.getItem('miaoge.diary.v1')||'{}')).filter(([date,e])=>validDate(date)&&e&&typeof e.title==='string'&&typeof e.body==='string').map(([date,e])=>({date,...e})); } catch { /* Preserve old data without touching it. */ }
  $('#main').innerHTML=`<div class="wrap">${pageHead('05','WRITING ROOM','让文字，落在这里。','使用 GitHub 登录，写完后直接发布到公开网站。')}<div class="admin-layout"><section class="admin-panel">
    <img class="admin-cat" src="/assets/cat.svg" alt="" width="55" height="55">
    <div class="eyebrow">THE OWNER'S WRITING ROOM</div><h2>${state.owner ? '欢迎回来，喵个喵。' : '从这里，开始写作。'}</h2>
    <p class="muted">${state.owner && state.connected ? '发布权限已连接。你可以从日历中选择日期，继续记录。' : '阅读无需登录。只有站主 Ciscochen17 可以编辑、发布和删除日记。'}</p>
    ${state.error ? `<div class="notice auth-error" role="alert">${icon('info')}<span>${escapeHTML(state.error)}</span></div>` : ''}
    ${!state.configured ? `<div class="setup-note"><strong>等待完成一次性连接</strong><p>站主需要先创建 Supabase 项目并配置 GitHub 登录。完成后，这里会开放登录入口。</p><a class="text-link" href="https://github.com/Ciscochen17/Ciscochen17.github.io/blob/main/docs/github-login-setup.md" target="_blank" rel="noopener noreferrer">查看配置指南 ${icon('external')}</a></div>` : ''}
    <div class="admin-buttons">${state.owner && state.connected ? `<a class="button primary" href="${diaryURL(today())}">${icon('pen')}写今天的日记</a><a class="button" href="/diary/">${icon('calendar')}打开日历</a>` : `<button class="button primary github-button" id="github-login" ${!state.configured?'disabled':''}>${icon('code')}使用 GitHub ${state.owner?'重新授权':'登录'}</button>`}${state.session ? '<button class="button quiet" id="github-logout">退出登录</button>' : ''}</div>
    <p class="auth-session-note">登录状态自动续期。主动退出、清除浏览器数据或撤销授权后，需要重新登录。</p>
    ${legacy.length ? `<div class="legacy-drafts"><span>发现 ${legacy.length} 篇旧版本机草稿，尚未公开。</span><button class="button sm" id="export-legacy">导出保留</button></div>` : ''}
  </section><aside class="admin-aside"><div class="side-label">HOW IT WORKS / 写作与发布</div><ol><li><strong>使用 GitHub 登录</strong><span>确认你的站主身份，自动连接发布权限。</span></li><li><strong>选一天，写一点</strong><span>Markdown 编辑、并排预览，文字只在当前编辑页面。</span></li><li><strong>点击发布，公开可见</strong><span>内容直接提交 GitHub，网站更新后所有人都能阅读。</span></li></ol><div class="notice">${icon('info')}<span>GitHub Pages 发布需要等待。提交成功与网站更新会分别提示。</span></div></aside></div></div>`;
  const login = $('#github-login');
  if(login)login.onclick=async()=>{login.disabled=true;login.textContent='正在前往 GitHub…';try{await SiteAuth.login(new URLSearchParams(location.search).get('returnTo')||'/admin/');}catch(error){toast(error.message);login.disabled=false;login.textContent='使用 GitHub 登录';}};
  if($('#github-logout'))$('#github-logout').onclick=async()=>{try{await SiteAuth.logout();await renderAdmin();toast('已退出站主管理');}catch(error){toast(error.message);}};
  if($('#export-legacy'))$('#export-legacy').onclick=()=>downloadFile(`miaoge-legacy-diary-${today()}.json`,JSON.stringify({version:1,entries:legacy},null,2),'application/json');
}

async function renderDiaryEditor() {
  await SiteAuth.ready;
  const param=new URLSearchParams(location.search).get('date'),date=param===null?today():param;
  if(!validDate(date))return notFound('这个日期不存在。','返回日历','/diary/');
  document.title=`${date} · 日记 · 喵个喵`;
  const canWrite=SiteAuth.state.owner&&SiteAuth.state.connected;
  let existing=published.find(e=>e.date===date)||null,baseRevision='';
  if(canWrite){
    try{const result=await SiteAuth.api(`/diary?date=${date}`);existing=result.entry;baseRevision=result.baseRevision;published=result.entries.sort((a,b)=>b.date.localeCompare(a.date));}
    catch(error){$('#main').innerHTML=`<div class="wrap error-panel"><a href="/diary/" class="back-link">${icon('left')}返回日历</a><h1>暂时无法打开写作页。</h1><p>${escapeHTML(error.message)}</p><a class="button" href="/admin/">检查登录与发布连接</a></div>`;return;}
  }
  const loginURL=`/admin/?returnTo=${encodeURIComponent(diaryURL(date))}`;
  $('#main').innerHTML=`<div class="wrap"><div class="editor-header"><a class="back-link" href="/diary/">${icon('left')}返回日历</a><div class="editor-actions"><button class="button sm" id="export-entry">${icon('download')}导出 Markdown</button>${canWrite?`<button class="button sm" id="toggle-edit">${icon('pen')}编辑日记</button><button class="button sm primary" id="publish-entry">发布日记</button>`:`<a class="button sm" href="${loginURL}">${icon('pen')}站主登录写作</a>`}</div></div>
    <div class="editor-heading"><h1>${readableDate(date)}</h1><span>${weekday(date)} · <span id="entry-visibility">${existing?'公开日记':'尚未记录'}</span></span></div>
    ${canWrite?`<div class="notice">${icon('info')}<span>点击“发布日记”会直接提交到 GitHub。未发布的编辑不会保存在本机，离开前请发布或导出。</span></div><div class="notice publish-status" id="publish-progress" role="status" hidden></div>
    <div id="editing-region"><div class="editor-shell"><input id="entry-title" class="editor-title" aria-label="日记标题" placeholder="给这一天，起个名字。" maxlength="200" value="${escapeHTML(existing?.title||'')}"><div class="editor-toolbar"><div class="format-buttons" aria-label="Markdown 工具栏">${[['heading','H₂','插入二级标题'],['bold','<b>B</b>','加粗选中文字'],['italic','<i>I</i>','倾斜选中文字'],['quote','❞','插入引用'],['list','☷','插入列表'],['link','↗','插入链接'],['code','&lt;/&gt;','插入代码块']].map(([name,label,aria])=>`<button data-format="${name}" aria-label="${aria}">${label}</button>`).join('')}</div><div class="editor-tabs" role="group" aria-label="编辑器显示方式"><button data-mode="edit">编辑</button><button data-mode="split" class="active">并排</button><button data-mode="preview">预览</button></div></div>
    <div class="editor-body" id="editor-body" data-mode="split"><textarea id="entry-body" class="markdown-input" aria-label="Markdown 日记正文" spellcheck="false" maxlength="100000" placeholder="从一句话开始……&#10;&#10;## 今天的小事">${escapeHTML(existing?.body||'')}</textarea><div class="markdown-preview prose" id="entry-preview" aria-label="日记预览"></div></div><div class="editor-status"><span id="save-status" role="status">${existing?'已读取仓库中的公开日记':'写完后点击发布日记'}</span><span id="word-count"></span></div></div><div class="side-actions"><button class="button sm danger" id="delete-entry" ${!existing?'disabled':''}>删除公开日记</button></div></div>`:''}
    <article class="diary-reading" id="reading-region"><h2 class="reading-title" id="reading-title">${escapeHTML(existing?.title||'这一天，还留着空白。')}</h2><div class="reading-meta" id="reading-meta">${existing?'公开日记':'还没有公开日记。'}</div><div class="prose" id="reading-body">${existing?renderMarkdown(existing.body):'<p class="muted">普通的一天，也值得被记住。</p>'}</div></article>
    <div class="entry-pager"><a class="text-link" href="${diaryURL(shiftDate(date,-1))}">${icon('left')}前一天</a><a class="text-link" href="${diaryURL(shiftDate(date,1))}">后一天${icon('right')}</a></div></div>`;
  enhanceMarkdown($('#reading-body'));
  if(!canWrite){$('#export-entry').disabled=!existing;$('#export-entry').onclick=()=>{if(existing)downloadFile(`${date}.md`,`# ${existing.title}\n\n${existing.body}\n`);};return;}
  const title=$('#entry-title'),body=$('#entry-body');let dirty=false,busy=false,editing=!existing,pollTimer;
  function preview(){ $('#entry-preview').innerHTML=body.value.trim()?renderMarkdown(body.value):'<p class="muted">文字会在这里，慢慢长出来。</p>';enhanceMarkdown($('#entry-preview'));$('#word-count').textContent=`${body.value.replace(/\s/g,'').length} 字 · Markdown`; }
  function changed(){dirty=true;$('#save-status').className='';$('#save-status').textContent='有未发布修改';$('#entry-visibility').textContent='尚未发布的编辑';preview();}
  function view(value){editing=value;$('#editing-region').hidden=!value;$('#reading-region').hidden=value;$('#publish-entry').hidden=!value;$('#toggle-edit').innerHTML=`${icon('pen')}${value?'阅读预览':'编辑日记'}`;if(!value){$('#reading-title').textContent=title.value||'未命名日记';$('#reading-meta').textContent=dirty?'未发布预览':'公开日记';$('#reading-body').innerHTML=renderMarkdown(body.value);enhanceMarkdown($('#reading-body'));}}
  function setBusy(value){busy=value;title.disabled=value;body.disabled=value;$('#publish-entry').disabled=value;$('#delete-entry').disabled=value||!existing;$('#toggle-edit').disabled=value;$$('[data-format]').forEach(b=>b.disabled=value);}
  function progress(message,commit){const box=$('#publish-progress');box.hidden=false;box.innerHTML=`${icon('info')}<span>${escapeHTML(message)}${commit?` <a href="${escapeHTML(commit.url)}" target="_blank" rel="noopener noreferrer">查看提交 ↗</a>`:''}</span>`;}
  function watchPublication(expected,commit){
    clearTimeout(pollTimer);const started=Date.now();
    const check=async()=>{
      if(Date.now()-started>10*60*1000){progress('内容已提交；网站更新仍在等待，可稍后刷新查看。',commit);return;}
      try{const result=await fetch(`/data/diary.json?published=${commit.sha}&t=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(result.ok){const entries=await result.json();const entry=entries.find(e=>e.date===date);if(expected?entry?.title===expected.title&&entry?.body===expected.body:!entry){progress('网站已更新，所有访客都可以看到最新内容。',commit);return;}}}catch{/* Deployment or network may still be pending. */}
      pollTimer=setTimeout(check,10000);
    };
    pollTimer=setTimeout(check,5000);
  }
  async function publish(removing=false){
    if(busy)return;
    if(!removing&&(!title.value.trim()||!body.value.trim()))return toast('请先写好标题与正文');
    if(removing&&!confirm('删除这篇公开日记？这会提交到 GitHub，所有访客都将看不到它。历史版本仍可从仓库恢复。'))return;
    setBusy(true);$('#save-status').textContent=removing?'正在提交删除…':'正在提交到 GitHub…';
    try{
      const result=await SiteAuth.api('/diary',{method:removing?'DELETE':'PUT',body:{date,title:title.value,body:body.value,baseRevision}});
      existing=result.entry;baseRevision=result.baseRevision;dirty=false;
      published=published.filter(e=>e.date!==date);if(existing)published.unshift(existing);
      $('#save-status').className='';$('#save-status').textContent=result.unchanged?'内容与仓库一致，无需再次发布':'已提交到 GitHub';
      if(removing){title.value='';body.value='';preview();$('#entry-visibility').textContent='已提交删除';view(true);}
      else{$('#entry-visibility').textContent=result.unchanged?'公开日记':'已提交，等待网站更新';}
      if(result.commit){progress(removing?'删除已提交，等待网站更新。':'已提交，等待 GitHub Pages 更新。',result.commit);watchPublication(existing,result.commit);}
      toast(result.unchanged?'内容没有变化':removing?'删除已提交':'日记已提交发布');
    }catch(error){$('#save-status').className='error';$('#save-status').textContent=error.message;toast(error.message);}
    finally{setBusy(false);}
  }
  title.oninput=changed;body.oninput=changed;$('#publish-entry').onclick=()=>publish();$('#delete-entry').onclick=()=>publish(true);$('#toggle-edit').onclick=()=>view(!editing);
  $('#export-entry').onclick=()=>{if(!title.value.trim()&&!body.value.trim())return toast('还没有内容可以导出');downloadFile(`${date}-${(title.value||'日记').replace(/[\\/:*?"<>|]/g,'').slice(0,50)}.md`,`# ${title.value||'未命名日记'}\n\n日期：${date}\n\n${body.value}\n`);};
  $$('.editor-tabs button').forEach(b=>b.onclick=()=>{$('#editor-body').dataset.mode=b.dataset.mode;$$('.editor-tabs button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});});
  const formats={heading:['## ',''],bold:['**','**'],italic:['*','*'],quote:['> ',''],list:['- ',''],link:['[','](https://example.com)'],code:['```\n','\n```']};
  $$('[data-format]').forEach(b=>b.onclick=()=>{const [before,after]=formats[b.dataset.format],start=body.selectionStart,end=body.selectionEnd,selection=body.value.slice(start,end)||'文字',prefix=['heading','quote','list','code'].includes(b.dataset.format)&&start>0&&body.value[start-1]!=='\n'?'\n':'';body.setRangeText(prefix+before+selection+after,start,end,'end');body.focus();body.setSelectionRange(start+prefix.length+before.length,start+prefix.length+before.length+selection.length);changed();});
  window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
  preview();view(editing);if(matchMedia('(max-width:720px)').matches)$('[data-mode="edit"]').click();
}
