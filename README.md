# 喵个喵 · 个人小站

公开的日记、技术博客与拾光集。原生 HTML / CSS / JavaScript，无构建依赖，托管于 GitHub Pages。

## 本地预览

在仓库目录执行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

打开 http://127.0.0.1:4173 。页面需要通过 HTTP 运行，不能直接双击 HTML 文件。

## 目录

- `assets/`：共享样式、交互与本地 SVG 插画。
- `assets/vendor/`：固定版本的 Marked、DOMPurify、Highlight.js、Supabase SDK 及许可证；运行时不访问第三方 CDN。
- `content/blog/`：博客 Markdown 正文。
- `data/posts.json`：博客索引。
- `data/diary.json`：已发布的公开日记，数组格式，每篇含 `date`、`title`、`body`。
- `data/collection.json`：拾光集。
- `tools/publish_diary.py`：从 JSON 备份合并公开日记。
- `tools/create_page.py`：为新增文章生成静态入口与站点地图。

## GitHub 登录与直接发布

站主从 `/admin/` 使用 GitHub 登录，进入日记编辑页后点击「发布日记」，内容直接提交到仓库。所有访客都能阅读公开日记；只有 GitHub 账号 ID `80182649` 可以调用发布接口。

登录由 Supabase Auth 托管，发布由 Supabase Edge Function 托管，不需要自行运维服务器。首次配置见 [GitHub 登录配置指南](docs/github-login-setup.md)。默认 `data/auth.json` 为空，配置就绪前管理页显示初始化说明，不会假装登录已经可用。

- `assets/auth.js`：PKCE 登录、会话自动续期和发布 API 客户端。
- `assets/writing.js`：公开阅读、站主管理、日记编辑、发布和删除。
- `supabase/functions/github-publish/`：验证真实登录身份、加密存储 GitHub 凭据、检查版本并提交仓库。
- `supabase/migrations/`：只允许服务端访问的凭据表。
- `data/auth.json`：仅填写 Supabase Project URL 与 Publishable key / anon key。

GitHub provider token 不持久化在浏览器中，只在首次授权回调时交给服务端并加密保存。浏览器保留的是可自动续期的 Supabase 会话。仓库不保存 Client Secret、service_role key 或个人访问令牌。

日记不再自动存为本机草稿。未发布文字仅存在当前编辑页面；离开前请发布或导出 Markdown。旧版本机草稿保持原样，管理页可以导出，不会自动公开。

GitHub Pages 发布需要等待，页面分别显示「已提交」与「网站已更新」。同一篇日记在其他设备发生修改时，发布会报告冲突，避免静默覆盖。删除也会生成 GitHub 提交，历史版本可从仓库恢复。

日历页支持导出公开日记备份。原来的 `tools/publish_diary.py` 仍保留，供站主离线导入旧备份使用，但日常写作无需运行脚本。

## 验证

```sh
node --test tests/*.test.mjs
node --check assets/app.js
node --check assets/auth.js
node --check assets/writing.js
python3 tools/create_page.py
```

自动测试覆盖非站主访问拒绝、会话服务端校验、OAuth 凭据存储保护、日记 UTF-8 提交、幂等发布、同日冲突、不同日期并发合并及删除。首次接入项目后仍需完成一次真实 GitHub 登录与发布验证。

## 新增博客

1. 在 `content/blog/` 新建 Markdown 正文。
2. 在 `data/posts.json` 中新增条目，填写独一无二的 `slug`、`title`、`excerpt`、`category`、`tags`、`date`、`updated`、`file`。最新文章放最前。
3. 执行 `python3 tools/create_page.py`，生成新文章静态入口和站点地图。
4. 提交并推送。

文章元数据、页面标题和摘要会生成到 HTML。JavaScript 在本地解析 Markdown，并经 DOMPurify 清理后显示。代码使用本地 Highlight.js 高亮。外部图片在正文/预览中显示占位说明，建议使用仓库内的图片资源。

## 拾光集

修改 `data/collection.json`，分类为 `项目`、`书影音` 或 `收藏`。字段包括 `id`、`title`、`category`、`description`、`url`、`label`、`cover` 和 `date`。`cover` 支持 `project` 和 `resource`。

## 发布

保持 Pages 来源为 `main` 分支根目录，`CNAME` 为 `miaogemiao.xin`。推送后自动发布。`.nojekyll` 使 GitHub Pages 直接提供静态文件。

修改共享脚本或样式后，运行 `python3 tools/create_page.py` 更新资源版本参数，避免浏览器继续使用旧缓存。
