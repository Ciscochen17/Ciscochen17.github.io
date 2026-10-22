一个个人网站，可以从一个域名和一张简单的网页开始。

这个小站的地址是 **miaogemiao.xin**。域名在阿里云注册，网页文件放在 GitHub 仓库，通过 GitHub Pages 发布。这里整理了搭建过程中的几个关键步骤，方便以后回看。

## 域名与网站，分别负责什么

域名是访问网站时使用的地址；网页文件决定看到的内容；托管服务负责把这些文件发送给访客。

在这里，三者的关系是：

```text
miaogemiao.xin
    ↓ DNS 解析
GitHub Pages
    ↓ 返回网页
首页 / 日记 / 技术博客 / 拾光集
```

购买域名之后，还需要部署网页并配置解析，才能通过这个地址打开网站。

## 先让默认地址可以访问

创建名为 `Ciscochen17.github.io` 的公开仓库，在根目录放置 `index.html`。接着进入仓库的 **Settings → Pages**，选择从 `main` 分支的根目录发布。

先检查 GitHub 提供的默认地址能否打开，可以把发布问题与域名问题分开排查。

## 把自己的域名连接过来

在仓库的 Pages 设置中，把 Custom domain 设为 `miaogemiao.xin`。然后到阿里云 DNS 控制台，为根域名配置 GitHub Pages 的 A 记录，为 `www` 配置指向 `ciscochen17.github.io` 的 CNAME 记录。

| 主机记录 | 类型 | 指向 |
| --- | --- | --- |
| @ | A | GitHub Pages 官方提供的 IP 地址 |
| www | CNAME | ciscochen17.github.io |

具体 IP 地址以 [GitHub 自定义域名文档](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) 为准。

## 验证域名归属之后，还要绑定网站

这一步很容易混淆：账户设置中的 **Verify domain** 用来证明域名归属，仓库设置中的 **Custom domain** 才是把域名连接到具体网站。

> 如果默认地址可以打开，自定义域名却显示 “There isn't a GitHub Pages site here”，优先检查仓库的 Custom domain 是否已保存。

域名验证使用的 TXT 记录可以保留。解析变更需要等待传播，不能只凭刚保存后的页面立即判断失败。

## 最后开启 HTTPS

DNS 检查通过、证书准备好之后，在 Pages 设置中勾选 **Enforce HTTPS**。

如果证书还没有生成，稍后再检查。不要在等待过程中反复修改已经正确的 DNS 记录。

## 接下来，慢慢填满它

现在，小站分成公开日记、技术博客和拾光集。网页源代码与公开文章都可以在仓库里维护，提交后由 GitHub Pages 自动发布。

参考：[GitHub Pages 文档](https://docs.github.com/en/pages) · [阿里云 DNS 文档](https://help.aliyun.com/zh/dns/)
