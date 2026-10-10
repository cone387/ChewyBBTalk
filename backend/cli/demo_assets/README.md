# 演示媒体

sample.mp4 为本项目生成的两秒 H.264 测试图案，无音轨、无外部素材依赖。生成命令：

```bash
ffmpeg -f lavfi -i 'testsrc2=size=320x180:rate=12:duration=2' -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart sample.mp4
```

运行演示初始化不需要安装 ffmpeg。其他图片、音频和文档由 `cli/demo_media.py` 离线生成。
