DEMO_TAGS = [
    {'name': '日常', 'color': '#3B82F6'},
    {'name': '读书', 'color': '#8B5CF6'},
    {'name': '美食', 'color': '#F59E0B'},
    {'name': '旅行', 'color': '#10B981'},
    {'name': '技术', 'color': '#6366F1'},
    {'name': '随想', 'color': '#EC4899'},
]

DEMO_BBTALKS = [
    {
        'content': '今天天气真好，适合出门走走。午后阳光透过树叶洒下来，心情格外舒畅。',
        'tags': ['日常'],
        'visibility': 'public',
        'hours_ago': 2,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
            'location': {'latitude': 30.2741, 'longitude': 120.1551},
        },
    },
    {
        'content': '读完了《人类简史》，对"认知革命"这个概念印象深刻。人类之所以能够大规模协作，靠的是共同相信虚构的故事——国家、宗教、金钱，都是这样的"故事"。',
        'tags': ['读书', '随想'],
        'visibility': 'public',
        'hours_ago': 8,
        'context': {
            'source': {'client': 'ChewyBBTalk Web', 'version': '1.0', 'platform': 'web'},
        },
    },
    {
        'content': '试了一家新开的拉面馆，豚骨汤底浓郁，叉烧入口即化，溏心蛋完美。下次还来！',
        'tags': ['美食'],
        'visibility': 'public',
        'hours_ago': 26,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
            'location': {'latitude': 31.2304, 'longitude': 121.4737},
        },
    },
    {
        'content': '周末去了趟西湖，断桥上人不多，远处山色朦胧，很有水墨画的感觉。\n\n> 欲把西湖比西子，淡妆浓抹总相宜。',
        'tags': ['旅行'],
        'visibility': 'public',
        'hours_ago': 50,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
            'location': {'latitude': 30.2590, 'longitude': 120.1388},
        },
    },
    {
        'content': '刚用 React Native + Expo 搭了一个碎碎念 App，热重载体验很好，写起来跟 web 开发差不多。EAS Build 直接出包也省了不少配环境的时间。',
        'tags': ['技术'],
        'visibility': 'public',
        'hours_ago': 72,
        'context': {
            'source': {'client': 'ChewyBBTalk Web', 'version': '1.0', 'platform': 'web'},
        },
    },
    {
        'content': '有时候觉得记录本身就是一种力量。不需要多完美的文字，只要把那一刻的感受留下来，以后翻看时就像打开了一个时间胶囊。',
        'tags': ['随想'],
        'visibility': 'public',
        'hours_ago': 96,
        'is_pinned': True,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.1.0', 'platform': 'mobile'},
        },
    },
    {
        'content': '学到一个新的 Markdown 技巧：\n\n```python\n# 列表推导式真的很优雅\nresult = [x**2 for x in range(10) if x % 2 == 0]\n```\n\nPython 的语法糖用起来太舒服了。',
        'tags': ['技术'],
        'visibility': 'public',
        'hours_ago': 120,
        'context': {
            'source': {'client': 'ChewyBBTalk Web', 'version': '1.0', 'platform': 'web'},
        },
    },
    {
        'content': '今天做了番茄炒蛋盖饭，简单但治愈。秘诀是鸡蛋要先炒嫩一点捞出来，番茄多炒一会儿出汁，最后合在一起翻几下就好。',
        'tags': ['美食', '日常'],
        'visibility': 'public',
        'hours_ago': 144,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
            'location': {'latitude': 39.9042, 'longitude': 116.4074},
        },
    },
    {
        'content': '这是一条私密碎碎念，只有自己能看到。有些想法不需要分享，写下来给未来的自己看就好。',
        'tags': ['随想'],
        'visibility': 'private',
        'hours_ago': 168,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.2.0', 'platform': 'mobile'},
        },
    },
    {
        'content': '整理了一下书单，接下来想读：\n\n- 《百年孤独》\n- 《思考，快与慢》\n- 《设计模式》\n- 《刀锋》\n\n一个月一本，不贪多。',
        'tags': ['读书'],
        'visibility': 'public',
        'hours_ago': 200,
        'context': {
            'source': {'client': 'ChewyBBTalk Mobile', 'version': '1.1.0', 'platform': 'mobile'},
            'location': {'latitude': 30.5728, 'longitude': 104.0668},
        },
    },
]

DEMO_COMMENTS = [
    {'bbtalk_index': 0, 'content': '确实，春天的阳光最舒服了'},
    {'bbtalk_index': 1, 'content': '这本书确实很值得一读，推荐再看看《未来简史》'},
    {'bbtalk_index': 2, 'content': '看起来好好吃！在哪里呀'},
    {'bbtalk_index': 5, 'content': '说得好，记录即生活'},
]
