#!/usr/bin/env python3
"""Write PUBLIC Supabase config only; never accepts server-side credentials."""
import argparse
import base64
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def validate(url, key):
    parsed = urlparse(url)
    if (parsed.scheme != 'https' or not re.fullmatch(r'[a-z0-9-]+\.supabase\.co', parsed.netloc)
            or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise ValueError('请输入标准 Supabase Project URL：https://项目编号.supabase.co')
    if key.startswith('sb_publishable_') and len(key) > 25:
        pass
    elif key.startswith('eyJ'):
        try:
            payload = key.split('.')[1]
            decoded = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            if decoded.get('role') != 'anon':
                raise ValueError()
        except (ValueError, IndexError, TypeError):
            raise ValueError('只接受 anon key，拒绝 service_role/secret key') from None
    else:
        raise ValueError('只接受 Publishable key 或 anon key，不要提供秘密值')
    return {'supabaseUrl': f'https://{parsed.netloc}', 'publishableKey': key}


def main():
    parser = argparse.ArgumentParser(description='填写网站可公开的 Supabase 登录配置')
    parser.add_argument('url')
    parser.add_argument('publishable_key')
    args = parser.parse_args()
    try:
        config = validate(args.url, args.publishable_key)
    except ValueError as error:
        parser.exit(1, f'未写入配置：{error}\n')
    (ROOT / 'data/auth.json').write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    subprocess.run([sys.executable, str(ROOT / 'tools/create_page.py')], check=True)
    print('公开配置已写入。提交并推送后，站主管理页将启用 GitHub 登录。')


if __name__ == '__main__':
    main()
