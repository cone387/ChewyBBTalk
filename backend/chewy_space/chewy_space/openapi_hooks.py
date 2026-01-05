from typing import Any

# 路径关键词 -> 标签名称映射 (顺序很重要，更具体的匹配应该在前面)
PATH_TAG_MAPPING = (
    ('/bbtalk/tags/', 'Tag'),
    ('/bbtalk/', 'BBTalk'),
    ('/media/', 'Media'),
    ('/auth/', 'Auth'),
    ('/user/', 'User'),
)


def get_tag_by_path(path: str) -> str:
    """根据路径获取对应的标签名称"""
    for keyword, tag in PATH_TAG_MAPPING:
        if keyword in path:
            return tag
    return 'Other'


def add_tags_by_path(
    result: dict[str, Any],
    generator: Any,
    request: Any,
    public: bool
) -> dict[str, Any]:
    """
    drf-spectacular 后处理钩子：自动根据路径为 API 添加标签分组
    
    示例:
      /api/v1/bbtalk/... → tags = ['BBTalk']
      /api/v1/media/... → tags = ['Media']
    """
    paths = result.get('paths', {})

    for path, path_item in paths.items():
        tag_name = get_tag_by_path(path)
        
        for method, operation in path_item.items():
            if isinstance(operation, dict):
                operation['tags'] = [tag_name]

    return result
