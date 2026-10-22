#!/usr/bin/env python3
"""Generate HTML entry points and sitemap for this buildless site."""
import json
import re
import hashlib
from pathlib import Path
from html import escape
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parents[1]
DOMAIN = 'https://miaogemiao.xin'


def asset(path):
    digest = hashlib.sha256((ROOT / path.lstrip('/')).read_bytes()).hexdigest()[:12]
    return f'{path}?v={digest}'


def page(title, description, url, noindex=False):
    canonical = DOMAIN + url
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f8f7f1">
  <title>{escape(title)}</title>
  <meta name="description" content="{escape(description, quote=True)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{escape(title, quote=True)}">
  <meta property="og:description" content="{escape(description, quote=True)}">
  <meta property="og:url" content="{canonical}">
  <link rel="canonical" href="{canonical}">
{'  <meta name="robots" content="noindex,follow">' if noindex else ''}
  <link rel="icon" type="image/svg+xml" href="/assets/cat.svg">
  <link rel="stylesheet" href="{asset('/assets/tokens.css')}">
  <link rel="stylesheet" href="{asset('/assets/style.css')}">
  <link rel="stylesheet" href="{asset('/assets/vendor/highlight.css')}">
  <script defer src="{asset('/assets/vendor/marked.js')}"></script>
  <script defer src="{asset('/assets/vendor/purify.js')}"></script>
  <script defer src="{asset('/assets/vendor/highlight.js')}"></script>
  <script defer src="{asset('/assets/app.js')}"></script>
</head>
<body>
  <a class="skip" href="#main">跳到主要内容</a>
  <header id="header" class="site-header"></header>
  <main id="main"><div class="loading" role="status">小站正在打开…</div></main>
  <noscript><div class="wrap"><h1>{escape(title)}</h1><p>请启用 JavaScript 以阅读文章、浏览日历和编辑日记。</p></div></noscript>
  <footer id="footer" class="site-footer"></footer>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
</body>
</html>
'''


def main():
    pages = [
        ('/', '喵个喵 · 日常与好奇', '记录日常，整理技术，也收藏一些不期而遇。欢迎来到喵个喵的个人小站。'),
        ('/diary/', '日记 · 喵个喵', '在日历上挑一天，看看过去，或者写下此刻。'),
        ('/diary/write/', '写日记 · 喵个喵', '用 Markdown 记下这一天。'),
        ('/blog/', '技术博客 · 喵个喵', '记录实践的过程，整理技术笔记与工具使用方法。'),
        ('/collection/', '拾光集 · 喵个喵', '项目、书影音和好用的工具，把喜欢一点点收集。'),
        ('/about/', '关于 · 喵个喵', '你好，我是喵个喵。欢迎来到这个持续生长的个人小站。'),
    ]
    posts = json.loads((ROOT / 'data/posts.json').read_text(encoding='utf-8'))
    seen = set()
    for post in posts:
        slug = post['slug']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or slug in seen:
            raise ValueError(f'无效或重复的文章 slug: {slug}')
        seen.add(slug)
        source = ROOT / post['file'].lstrip('/')
        text = source.read_text(encoding='utf-8')
        post['wordCount'] = len(text)
        pages.append((f'/blog/{slug}/', f"{post['title']} · 喵个喵", post['excerpt']))
    (ROOT / 'data/posts.json').write_text(json.dumps(posts, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for url, title, description in pages:
        destination = ROOT / url.strip('/') / 'index.html'
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(page(title, description, url, noindex=url == '/diary/write/'), encoding='utf-8')
    (ROOT / '404.html').write_text(page('页面未找到 · 喵个喵', '这条小路，暂时还没有通向哪里。', '/404.html', True), encoding='utf-8')
    urls = ''.join(f'<url><loc>{xml_escape(DOMAIN + url)}</loc></url>\n' for url, _, _ in pages if url != '/diary/write/')
    (ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n', encoding='utf-8')
    print(f'生成 {len(pages)} 个页面入口及 404、sitemap.xml')


if __name__ == '__main__':
    main()
