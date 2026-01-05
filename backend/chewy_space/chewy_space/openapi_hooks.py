

def add_tags_by_path(result, generator, request, public):
    """
    自动根据 path 分组，例如:
      /api/v1/bbtalk/... → tags = ['BBTalk']
      /api/v1/media/... → tags = ['Media']
    """
    # result 是整个 openapi 字典，可以直接操作
    paths = result.get('paths', {})

    for path, path_item in paths.items():
        if '/bbtalk/' in path:
            tag_name = 'BBTalk'
        elif '/tag/' in path:
            tag_name = 'Tag'
        elif '/media/' in path:
            tag_name = 'Media'
        elif '/auth/' in path:
            tag_name = 'Auth'
        elif '/todo/group/' in path:
            tag_name = 'TodoGroup'
        elif '/todo/project/' in path:
            tag_name = 'TodoProject'
        elif '/todo/task/' in path:
            tag_name = 'TodoTask'
        elif '/todo/activity/' in path:
            tag_name = 'TodoActivity'
        else:
            tag_name = 'Other'

        # 给 path 下所有方法打标签
        for method, operation in path_item.items():
            if isinstance(operation, dict):
                operation['tags'] = [tag_name]

    # ✅ 最后别忘了返回修改后的 result
    return result
