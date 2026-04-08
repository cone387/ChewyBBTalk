"""
ChewyBBTalk CLI 快捷命令

用法:
    uv run dev              # 启动开发服务器 (0.0.0.0:8020)
    uv run migrate          # 数据库迁移
    uv run init             # 初始化系统（创建管理员）
    uv run makemigrations   # 创建迁移文件
    uv run collectstatic    # 收集静态文件
    uv run test             # 运行测试
    uv run shell            # Django shell
"""

import sys
import os

def _setup():
    """设置 Django 环境"""
    # 将 chewy_space 加入 Python 路径
    base = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(base, "chewy_space"))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "chewy_space.settings")

def _manage(args: list[str]):
    """调用 Django manage.py"""
    _setup()
    from django.core.management import execute_from_command_line
    execute_from_command_line(["manage.py"] + args)

def dev():
    _manage(["runserver", "0.0.0.0:8020"])

def migrate():
    _manage(["migrate"])

def init():
    _manage(["init_system"])

def makemigrations():
    _manage(["makemigrations"])

def collectstatic():
    _manage(["collectstatic", "--noinput"])

def test():
    _manage(["test", "bbtalk"])

def shell():
    _manage(["shell"])
