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
- `assets/vendor/`：固定版本的 Marked、DOMPurify、Highlight.js 及许可证；运行时不访问第三方 CDN。
- `content/blog/`：博客 Markdown 正文。
- `data/posts.json`：博客索引。
- `data/diary.json`：已发布的公开日记，数组格式，每篇含 `date`、`title`、`body`。
- `data/collection.json`：拾光集。
- `tools/publish_diary.py`：从 JSON 备份合并公开日记。
- `tools/create_page.py`：为新增文章生成静态入口与站点地图。

## 写日记与公开发布

日历页和日记均公开可读，不使用登录或密钥。浏览器中的修改自动存为本机草稿，不会直接写入仓库，也不会向其他访问者展示。浏览器清理数据、无痕模式或更换设备会影响草稿，请定期导出备份。

1. 在日记日历中选择日期，用 Markdown 写作。
2. 日历页点击「导出备份」，获得 JSON。
3. 将文件保存在仓库外，执行：

```sh
python3 tools/publish_diary.py /完整路径/miaoge-diary-日期.json --check
python3 tools/publish_diary.py /完整路径/miaoge-diary-日期.json
git diff -- data/diary.json
git add data/diary.json
git commit -m 'Publish diary entries'
git push
```

备份会按日期合并；同日内容替换，不同日期保留。空白日记忽略，格式无效时不会修改公开数据。删除公开日记需从 `data/diary.json` 删除对应条目后发布。删除浏览器草稿不影响公开记录。

公开数据对任何人可读，备份中的内容经此操作会公开发布。直接编辑 GitHub 仓库也可以更新日记。

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
