import { COMPOSE_TOOLBAR_LABELS } from '../../src/utils/composeToolbarLabels';

describe('Compose toolbar accessibility labels', () => {
  it('defines a label for every icon-only toolbar action', () => {
    expect(Object.values(COMPOSE_TOOLBAR_LABELS)).toEqual([
      '添加图片', '拍照', '添加视频', '添加文件', '录音', '插入标签',
      '添加位置', '切换为公开', '加粗', '斜体', '标题', '无序列表', '引用', '代码', '链接',
    ]);
  });
});
