import { xConfirm } from './crossAlert';

export function confirmPublicVisibility(onConfirm: () => void) {
  xConfirm('公开这条记录？', '公开后，其他人无需登录即可通过公开页面或接口查看正文和附件。请确认没有个人隐私或敏感信息。', onConfirm, undefined, { confirmText: '设为公开', cancelText: '保持原设置' });
}
