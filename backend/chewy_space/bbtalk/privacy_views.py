from django.http import HttpResponse
from django.views.decorators.http import require_GET


@require_GET
def privacy_policy_view(request):
    """
    返回隐私政策 HTML 页面。
    - 方法: GET
    - 权限: AllowAny (无需认证)
    - 返回: Content-Type: text/html, HTTP 200
    """
    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>隐私政策 - ChewyBBTalk</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                         "Helvetica Neue", Arial, "Noto Sans SC", sans-serif;
            line-height: 1.8;
            color: #1a1a1a;
            background-color: #f9fafb;
            padding: 20px;
        }
        .container {
            max-width: 720px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            padding: 32px 24px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        h1 {
            font-size: 1.75rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 8px;
            color: #111827;
        }
        .app-name {
            text-align: center;
            font-size: 0.95rem;
            color: #6b7280;
            margin-bottom: 24px;
        }
        .updated {
            text-align: center;
            font-size: 0.85rem;
            color: #9ca3af;
            margin-bottom: 32px;
        }
        h2 {
            font-size: 1.25rem;
            font-weight: 600;
            color: #111827;
            margin-top: 28px;
            margin-bottom: 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #e5e7eb;
        }
        h3 {
            font-size: 1.05rem;
            font-weight: 600;
            color: #374151;
            margin-top: 20px;
            margin-bottom: 8px;
        }
        p {
            margin-bottom: 12px;
            color: #374151;
            font-size: 0.95rem;
        }
        ul {
            margin-bottom: 12px;
            padding-left: 20px;
        }
        li {
            margin-bottom: 6px;
            color: #374151;
            font-size: 0.95rem;
        }
        .intro {
            color: #4b5563;
            font-size: 0.95rem;
            margin-bottom: 24px;
        }
        .footer {
            margin-top: 36px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            font-size: 0.85rem;
            color: #9ca3af;
        }
        @media (max-width: 640px) {
            body {
                padding: 12px;
            }
            .container {
                padding: 24px 16px;
                border-radius: 8px;
            }
            h1 {
                font-size: 1.5rem;
            }
            h2 {
                font-size: 1.1rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>隐私政策</h1>
        <p class="app-name">ChewyBBTalk</p>
        <p class="updated">最后更新日期：2025 年 7 月</p>

        <p class="intro">
            感谢您使用 ChewyBBTalk。我们非常重视您的隐私和个人数据安全。
            本隐私政策旨在向您说明我们如何收集、使用和保护您的个人信息。
            请在使用本应用前仔细阅读以下内容。
        </p>

        <h2>一、数据收集</h2>

        <h3>1. GPS 定位数据</h3>
        <p>
            本应用可能会请求访问您的设备定位信息，用于在碎碎念中记录地理位置标签。
        </p>
        <ul>
            <li>定位数据仅在您主动授权后采集</li>
            <li>您可以随时在设备设置中关闭定位权限</li>
            <li>定位数据仅用于内容标注，不会用于追踪或广告投放</li>
        </ul>

        <h3>2. 语音录音数据</h3>
        <p>
            本应用支持语音录制功能，允许您录制音频并作为附件保存。
        </p>
        <ul>
            <li>录音功能仅在您主动触发时启用</li>
            <li>录音数据存储在您配置的存储位置中</li>
            <li>我们不会在未经您同意的情况下访问或分析您的录音内容</li>
        </ul>

        <h3>3. 生物识别数据</h3>
        <p>
            本应用可能使用设备的生物识别功能（如 Face ID 或指纹识别）进行本地身份验证。
        </p>
        <ul>
            <li>生物识别数据由设备操作系统管理，不会被本应用直接访问或存储</li>
            <li>生物识别仅用于设备本地认证，数据不会上传至服务器</li>
            <li>您可以选择不启用生物识别认证，改用密码登录</li>
        </ul>

        <h2>二、数据存储方式</h2>
        <p>
            我们采取合理的技术和管理措施来保护您的个人数据安全：
        </p>
        <ul>
            <li>数据通过 HTTPS 加密传输，防止传输过程中被截获</li>
            <li>服务端数据存储在受保护的服务器环境中</li>
            <li>您可以选择将附件数据存储在自有的 S3 兼容存储服务中，完全掌控数据存储位置</li>
            <li>本地缓存数据存储在应用沙盒中，其他应用无法访问</li>
            <li>我们定期审查安全措施，确保数据保护的有效性</li>
        </ul>

        <h2>三、用户权利</h2>
        <p>
            您对自己的个人数据享有以下权利：
        </p>
        <ul>
            <li><strong>查看数据：</strong>您有权查看本应用收集和存储的所有个人数据</li>
            <li><strong>导出数据：</strong>您可以随时导出您的全部数据，包括碎碎念内容和附件文件</li>
            <li><strong>删除数据：</strong>您有权要求删除您的个人数据，包括账户信息、内容和附件</li>
        </ul>
        <p>
            如需行使上述权利，您可以通过应用内的数据管理功能操作，或联系我们获取帮助。
        </p>

        <h2>四、政策更新</h2>
        <p>
            我们可能会不定期更新本隐私政策。政策变更后，我们会在应用内通知您。
            继续使用本应用即表示您同意更新后的隐私政策。
        </p>

        <div class="footer">
            <p>&copy; ChewyBBTalk. 保留所有权利。</p>
        </div>
    </div>
</body>
</html>"""
    return HttpResponse(html, content_type="text/html")
