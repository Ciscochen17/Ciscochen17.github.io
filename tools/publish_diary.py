#!/usr/bin/env python3
"""Merge a diary backup into the public site. Does not commit or push."""
import argparse
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def validate(entries):
    if not isinstance(entries, list):
        raise ValueError('日记数据必须是数组，或包含 entries 数组的备份对象')
    seen = set()
    result = []
    for item in entries:
        if not isinstance(item, dict):
            raise ValueError('每条日记必须是对象')
        key = item.get('date', '')
        if not isinstance(key, str) or date.fromisoformat(key).isoformat() != key:
            raise ValueError(f'无效日期：{key!r}')
        if not 1900 <= date.fromisoformat(key).year <= 2100:
            raise ValueError('日记日期需在 1900–2100 年之间')
        if key in seen:
            raise ValueError(f'备份中有重复日期：{key}')
        seen.add(key)
        if not all(isinstance(item.get(field), str) for field in ('title', 'body')):
            raise ValueError(f'{key} 的标题和正文必须为文本')
        if not item['title'].strip() and not item['body'].strip():
            continue
        result.append({field: item[field] for field in ('date', 'title', 'body')})
    return result


def main():
    parser = argparse.ArgumentParser(description='把日记备份合并到公开日记。完成后需自行提交并推送仓库。')
    parser.add_argument('backup', type=Path, help='从日历页面导出的 JSON 文件')
    parser.add_argument('--check', action='store_true', help='只验证，不修改公开数据')
    args = parser.parse_args()
    try:
        data = json.loads(args.backup.read_text(encoding='utf-8'))
        incoming = validate(data if isinstance(data, list) else data.get('entries'))
        target = ROOT / 'data' / 'diary.json'
        existing = validate(json.loads(target.read_text(encoding='utf-8')))
        merged = {item['date']: item for item in existing}
        merged.update({item['date']: item for item in incoming})
        result = sorted(merged.values(), key=lambda item: item['date'], reverse=True)
        if not args.check:
            temp = target.with_suffix('.json.tmp')
            temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            temp.replace(target)
        print(f'验证成功：导入 {len(incoming)} 篇，公开日记共 {len(result)} 篇。' if args.check else f'已合并 {len(incoming)} 篇，公开日记共 {len(result)} 篇。提交并推送后生效。')
    except (OSError, ValueError, TypeError, AttributeError) as error:
        parser.exit(1, f'未修改公开数据：{error}\n')


if __name__ == '__main__':
    main()
