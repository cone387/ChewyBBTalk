## ADDED Requirements

### Requirement: Header 仅显示菜单和搜索图标
HomeScreen 顶部 Header SHALL 仅包含左侧汉堡菜单按钮和右侧搜索图标，MUST NOT 显示标题文字或筛选 badge。

#### Scenario: 正常加载首页
- **WHEN** 用户打开 HomeScreen
- **THEN** Header 区域仅显示左侧菜单按钮和右侧搜索图标，无标题文字

### Requirement: TagTabs 使用 pill 按钮样式
标签栏激活状态 SHALL 显示为蓝色圆角 pill 按钮（白色文字），未激活标签 SHALL 显示为灰色纯文字，MUST NOT 显示下划线指示器。

#### Scenario: 默认状态显示"全部"激活
- **WHEN** 无标签被选中
- **THEN** "全部"按钮显示为蓝色圆角 pill（白色文字），其他标签为灰色纯文字

#### Scenario: 选中某个标签
- **WHEN** 用户点击某个标签（如"旅行"）
- **THEN** 该标签变为蓝色圆角 pill 样式，"全部"和其他标签恢复为灰色纯文字

### Requirement: BBTalkCard 无标题布局
BBTalkCard SHALL NOT 在卡片内显示任何标题文字，卡片内容区域 SHALL 直接从 Markdown 正文开始（置顶徽章除外）。

#### Scenario: 渲染普通卡片
- **WHEN** 渲染一条 BBTalk 记录
- **THEN** 卡片内无标题行，直接显示 Markdown 内容

### Requirement: Blockquote 浅灰圆角背景样式
Markdown 中的 blockquote SHALL 渲染为浅灰色（#F3F4F6）圆角背景块，MUST NOT 使用左边框样式。

#### Scenario: 内容包含引用块
- **WHEN** BBTalk 内容中包含 Markdown blockquote（`>`前缀）
- **THEN** 引用文字显示在浅灰色圆角背景区域内，无左侧彩色边框

### Requirement: BBTalkCard footer 左侧标签 pill + 时间
卡片底部栏左侧 SHALL 显示第一个标签的彩色 pill（标签颜色背景+白色文字）和相对时间文本。如无标签则仅显示时间。MUST NOT 显示设备图标。

#### Scenario: 有标签的卡片
- **WHEN** BBTalk 有至少一个标签（如"旅行"，颜色绿色）
- **THEN** footer 左侧显示绿色圆角 pill "旅行" + "2天前"等相对时间文本

#### Scenario: 无标签的卡片
- **WHEN** BBTalk 无标签
- **THEN** footer 左侧仅显示相对时间文本

### Requirement: BBTalkCard footer 右侧图标组
卡片底部栏右侧 SHALL 依次显示定位图标、评论图标（带计数）、地球/可见性图标。

#### Scenario: 有位置和评论的卡片
- **WHEN** BBTalk 有位置信息且 commentCount > 0
- **THEN** footer 右侧依次显示定位图标、评论气泡图标+评论数、地球/锁图标

#### Scenario: 无位置无评论的卡片
- **WHEN** BBTalk 无位置信息且 commentCount 为 0
- **THEN** footer 右侧仅显示评论气泡图标（无数字）和地球/锁图标

### Requirement: 卡片间距与阴影优化
BBTalkCard SHALL 使用更大的卡片间距（marginTop >= 16）和更柔和的阴影（shadowOpacity <= 0.04）。

#### Scenario: Feed 列表渲染
- **WHEN** 多条 BBTalk 在列表中渲染
- **THEN** 卡片之间有明显间距，阴影柔和自然

### Requirement: FAB 白底蓝色图标样式
浮动操作按钮 SHALL 显示为白色圆形背景 + 蓝色 "+" 图标，带阴影效果。

#### Scenario: 首页显示 FAB
- **WHEN** 用户在 HomeScreen 浏览 Feed
- **THEN** 右下角显示白色圆形 FAB，内含蓝色 "+" 图标
