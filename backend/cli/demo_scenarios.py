"""Readable examples plus timeline volume for the supported record UI."""

EXTRA_TAGS = [
    '演示指南',
    'Markdown',
    '图片',
    '音视频',
    '附件',
    '工作',
    '运动',
    '计划',
    '长文本',
    'English',
    '中文 English 🌍',
    '这是一个用于检查侧栏换行与截断的较长标签名称',
    '暂未使用',
]


def scenarios():
    rows = []

    def add(key, content, tags=(), **values):
        rows.append(dict(key=key, content=content, tags=list(tags), **values))

    add(
        'guide',
        '# 演示场景导航\n\n这套账号包含 240 条初始记录。可搜索“场景”定位专项样例，搜索“时间线”体验连续滚动。\n\n'
        '- 标签筛选：Markdown / 图片 / 音视频 / 附件\n- 公开与私密：切换可见性筛选\n- 日期：记录跨越今天、上周、上月和去年\n'
        '- 附件：图片预览、视频播放、音频与文档下载\n- 评论：展开“密集评论”记录\n\n所有内容和媒体均为演示素材，可自由编辑。',
        ['演示指南'],
        is_pinned=True,
    )
    add('short', '好。', ['日常'])
    add('emoji', '🌧️ → ☕ → 📖 → 🌈\n今天也要照顾好自己。👨‍👩‍👧‍👦 🧑🏽‍💻 ❤️', ['日常'])
    add('untagged', '无标签场景：这条记录没有关联任何标签，可用于检查默认列表状态。')
    add(
        'multilingual',
        '多语言场景：你好，世界！Hello world! こんにちは。안녕하세요. Bonjour ! مرحبا بالعالم.\n\n数字 0123456789 · 符号 < > & " \' · 100% 完成。',
        ['English', '中文 English 🌍'],
    )
    add(
        'headings',
        '# 一级标题\n## 二级标题\n### 三级标题\n\n**粗体**、*斜体*、~~删除线~~、`行内代码`。\n\n---\n\n> 引用场景\n>\n> 多行引用保持段落间距。',
        ['Markdown'],
    )
    add(
        'lists',
        '## 清单场景\n\n- [x] 登录演示账号\n- [ ] 打开图片预览\n- [ ] 测试搜索\n\n1. 第一项\n2. 第二项\n   - 子项目甲\n   - 子项目乙',
        ['Markdown', '计划'],
    )
    add(
        'code',
        '代码块场景：\n\n```python\ndef greet(name: str):\n    return f"你好，{name}"\n\nprint(greet("demo"))\n```\n\n```json\n{"enabled": true, "tags": ["日常", "技术"]}\n```\n\n```\n无语言声明的代码块\n```',
        ['Markdown', '技术'],
    )
    add(
        'wide-code',
        '长代码行场景：\n\n```text\n' + 'very_long_identifier_without_spaces_' * 35 + '\n```',
        ['Markdown', '长文本'],
    )
    add(
        'table',
        '宽表格场景：\n\n| 项目 | 周一 | 周二 | 周三 | 周四 | 周五 | 周六 | 周日 | 备注 |\n'
        '|---|---|---|---|---|---|---|---|---|\n| 阅读 | 20页 | 30页 | 10页 | 35页 | 25页 | 40页 | 50页 | 持续积累 |\n'
        '| 步行 | 3000 | 6000 | 4000 | 8000 | 5000 | 12000 | 9000 | 周末户外 |',
        ['Markdown', '计划'],
    )
    add(
        'links',
        '链接场景：[示例链接](https://example.com)\n\nhttps://example.com/'
        + 'long-path-' * 45
        + '\n\n邮箱：demo@example.com',
        ['Markdown'],
    )
    add(
        'long',
        '长文本场景\n\n'
        + '\n\n'.join(
            f'第 {i} 段：清晨散步时，发现熟悉的街道也有新的细节。把今天的观察记下来，再慢慢整理成自己的生活地图。'
            * 4
            for i in range(1, 25)
        ),
        ['长文本', '随想'],
    )
    add(
        'many-tags',
        '多标签场景：检查标签折行、组合搜索与筛选移除。',
        ['日常', '工作', '技术', '计划', '随想', 'English', '中文 English 🌍', EXTRA_TAGS[-2]],
    )
    add(
        'search',
        '搜索场景：咖啡 coffee、周报、FastAPI、旅行计划。\n精确短语：blue sky。特殊字符：100% 和 under_score。',
        ['工作', 'English'],
    )
    add(
        'private-pinned',
        '私密置顶场景：只有 demo 登录后可见，用于检查私密徽标与置顶排序。',
        ['计划'],
        visibility='private',
        is_pinned=True,
    )
    add(
        'edited',
        '已编辑场景：创建于 90 天前，最近更新。分别尝试创建时间和更新时间排序。',
        ['工作'],
        hours_ago=90 * 24,
        updated_hours_ago=1,
    )
    add(
        'comments',
        '密集评论场景：这里有 24 条评论，可以展开、追加、删除并观察计数。',
        ['日常'],
        comments=24,
    )
    add(
        'private-comment',
        '私密评论场景：内容及讨论仅当前账号可见。',
        ['随想'],
        visibility='private',
        comments=3,
    )
    for count in (1, 2, 3, 4, 6, 9):
        add(
            f'gallery-{count}',
            f'{count} 图场景：横图、竖图和透明底的排列与预览。',
            ['图片'],
            media=[f'image{i}' for i in range(count)],
        )
    add('portrait', '长竖图场景：观察移动端限高与完整预览。', ['图片'], media=['image1'])
    add('panorama', '宽横图场景：观察宽图缩放与预览。', ['图片'], media=['image3'])
    add('transparent', '透明图片场景：棋盘块包含半透明区域。', ['图片'], media=['image4'])
    add('video', '视频场景：两秒动态图案，可播放、暂停和拖动进度。', ['音视频'], media=['video'])
    add('audio', '音频附件场景：一秒提示音，可下载试听。', ['音视频'], media=['audio'])
    add(
        'documents',
        '文档场景：PDF、文本、CSV、JSON 与 ZIP，包含中文和带空格的文件名。',
        ['附件'],
        media=['pdf', 'text', 'csv', 'json', 'zip'],
    )
    add(
        'mixed',
        '混合附件场景：同一条记录包含图片、视频、音频和 PDF。',
        ['图片', '音视频', '附件'],
        media=['image0', 'video', 'audio', 'pdf'],
    )
    add(
        'private-media',
        '私密附件场景：未登录时不能读取这些图片和文档。',
        ['图片', '附件'],
        visibility='private',
        media=['image2', 'pdf'],
    )
    sources = [('Web', 'web'), ('iOS', 'ios'), ('Android', 'android'), ('Desktop', 'desktop')]
    for index, (client, platform) in enumerate(sources):
        add(
            f'source-{platform}',
            f'{client} 来源与地点场景：检查设备提示和坐标展示。',
            ['旅行'],
            context={
                'source': {'client': f'BBTalk {client}', 'version': 'demo', 'platform': platform},
                'location': {'latitude': 30.25 + index, 'longitude': 120.15 + index},
            },
        )
    activities = [
        ('阅读', '读书', '摘录了一段喜欢的文字，留待下次重读。'),
        ('午餐', '美食', '尝试了新的家常菜，记录食材和制作心得。'),
        ('跑步', '运动', '完成轻松慢跑，沿河边散步放松。'),
        ('周报', '工作', '整理本周进展，列出下一步需要解决的问题。'),
        ('出游', '旅行', '沿途发现一家安静的小店，记在下次行程里。'),
        ('学习', '技术', '完成一个小练习，记录遇到的问题和解决思路。'),
    ]
    for index in range(230 - len(rows)):
        title, tag, content = activities[index % len(activities)]
        days = [0, 1, 2, 7, 14, 30, 60, 90, 180, 365, 400][index % 11]
        add(
            f'timeline-{index:02}',
            f'时间线 {index + 1:02} · {title}\n\n{content}\n今天的关键词：{["咖啡", "晴天", "周末", "学习"][index % 4]}。',
            [tag],
            hours_ago=days * 24 + index % 20 + 1,
            visibility='private' if index % 4 == 0 else 'public',
            comments=index % 4,
        )
    for index, row in enumerate(rows):
        row.setdefault('hours_ago', index / 2)
        row.setdefault('visibility', 'public')
        row.setdefault('comments', 0)
    return rows
