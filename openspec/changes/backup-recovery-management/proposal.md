## Why

已有导入导出与宿主机备份命令，但用户无法查看备份结果或下载历史备份；附件读取失败仍可能生成不完整 ZIP 而不提示。需要让备份状态可信，并用完整恢复演练验证可恢复性。

## What Changes

- 数据管理页增加当前账号的服务器备份列表、状态、创建、下载和明确失败反馈。
- 定时命令与页面创建共用备份服务，原子发布文件，按账号隔离与串行创建；历史 ZIP 继续可见。
- 包含附件的备份在文件缺失或读取失败时明确失败，不替换可用备份。
- 完整恢复演练覆盖正文、标签、评论、可见性、上下文、置顶与附件字节及引用；导入部分失败不能误报全部成功。
- 不引入跨用户备份浏览、不恢复 PWA、不要求真机验收。

## Capabilities

### New Capabilities
- `backup-management`: 当前账号的备份创建、列表、状态与受保护下载。

### Modified Capabilities
- `data-portability`: 完整 ZIP 的附件失败处理和恢复结果反馈。

## Impact

backend/chewy_space/bbtalk/backups.py、backup_views.py、urls.py、management/commands/backup_data.py、data_export.py、data_import.py、views.py 及备份/恢复测试；frontend/src/pages/DataManagementPage.tsx、services/api/dataApi.ts、备份组件和浏览器回归；ROADMAP.md 与备份操作说明。备份目录延用 DATA_DIR/backups，配置自定义目录时命令与 API 使用同一配置。
