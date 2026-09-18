import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BRAND, COPY, FONT_SANS } from '../../theme';
import { fadeSlideUp, float, range, sceneOpacity, springScale, useAnim } from '../../anim';
import { Icon, IconName } from '../../components/Icon';

const DURATION = 235;

/** 上下两幕在场景内部做切换 */
const PART_A_OUT: [number, number] = [110, 124];
const PART_B_IN: [number, number] = [118, 134];

const DATA_ICONS: IconName[] = ['archive', 'swap', 'shield'];

/** 鼠标指针（用于演示"动一下就解锁"） */
const Cursor: React.FC<{ x: number; y: number; opacity: number }> = ({ x, y, opacity }) => (
  <svg
    width={38}
    height={38}
    viewBox="0 0 24 24"
    style={{ position: 'absolute', left: x, top: y, opacity, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))' }}
  >
    <path
      d="M5 2.5 19.5 12.2l-6.1 1.1 3.2 6.4-2.7 1.3-3.2-6.5-4.3 4.2Z"
      fill="#FFFFFF"
      stroke={BRAND.text}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);

export const Scene3Privacy: React.FC = () => {
  const { frame, fps } = useAnim();
  const opacity = sceneOpacity(frame, DURATION);

  // ---------- 上半幕：防窥模式 ----------
  const partA = range(frame, PART_A_OUT, [1, 0]);

  // 模糊量：逐渐模糊 → 停留 → 一动就立刻恢复
  const blur = Math.min(
    range(frame, [28, 56], [0, 12]),
    range(frame, [86, 93], [12, 0]),
  );
  const lockedBadge = Math.min(range(frame, [58, 72], [0, 1]), range(frame, [86, 92], [1, 0]));
  const unlockedBadge = range(frame, [92, 104], [0, 1]);

  const cursorOpacity = Math.min(range(frame, [78, 84], [0, 1]), range(frame, [86, 90], [1, 0.85]));
  const cursorX = range(frame, [78, 88], [330, 226]);
  const cursorY = range(frame, [78, 88], [268, 196]);

  // ---------- 下半幕：数据自主 ----------
  const partB = range(frame, PART_B_IN, [0, 1]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.bg,
        opacity,
        fontFamily: FONT_SANS,
        overflow: 'hidden',
      }}
    >
      {/* ============ 上半幕 ============ */}
      <AbsoluteFill
        style={{
          opacity: partA,
          padding: '0 180px',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 120,
        }}
      >
        {/* 模拟的 BBTalk 卡片 */}
        <div style={{ position: 'relative', width: 600, flexShrink: 0 }}>
          <div
            style={{
              position: 'relative',
              backgroundColor: BRAND.surface,
              borderRadius: 26,
              border: `1px solid ${BRAND.border}`,
              boxShadow: '0 22px 56px rgba(15,23,42,0.10)',
              padding: 34,
              ...fadeSlideUp(frame, 6, 22, 26),
            }}
          >
            <div style={{ filter: `blur(${blur}px)`, transition: 'none' }}>
              {/* 作者行 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: BRAND.gradient,
                  }}
                />
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.text }}>
                    {COPY.privacy.mock.author}
                  </div>
                  <div style={{ fontSize: 18, color: BRAND.textMuted, marginTop: 3 }}>
                    {COPY.privacy.mock.time}
                  </div>
                </div>
              </div>

              {/* 正文 */}
              <p
                style={{
                  margin: '24px 0 0',
                  fontSize: 25,
                  lineHeight: 1.65,
                  color: BRAND.textSub,
                }}
              >
                {COPY.privacy.mock.body}
              </p>

              {/* 标签 */}
              <div style={{ marginTop: 22, display: 'flex', gap: 12 }}>
                {COPY.privacy.mock.tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 19,
                      fontWeight: 600,
                      color: BRAND.indigo,
                      backgroundColor: BRAND.purpleSoft,
                      padding: '7px 16px',
                      borderRadius: 999,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* 状态徽标（浮在模糊内容之上） */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                marginTop: -34,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '15px 30px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(15,23,42,0.86)',
                  backdropFilter: 'blur(6px)',
                  opacity: lockedBadge,
                  transform: `scale(${0.9 + lockedBadge * 0.1})`,
                }}
              >
                <Icon name="lock" size={24} color="#FFFFFF" strokeWidth={2.1} />
                <span style={{ fontSize: 22, fontWeight: 600, color: '#FFFFFF' }}>
                  {COPY.privacy.lockHint}
                </span>
              </div>
              <div
                style={{
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '15px 30px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(16,185,129,0.94)',
                  opacity: unlockedBadge,
                  transform: `scale(${0.9 + unlockedBadge * 0.1})`,
                }}
              >
                <Icon name="check" size={24} color="#FFFFFF" strokeWidth={2.6} />
                <span style={{ fontSize: 22, fontWeight: 600, color: '#FFFFFF' }}>已恢复清晰</span>
              </div>
            </div>

            <Cursor x={cursorX} y={cursorY} opacity={cursorOpacity} />
          </div>
        </div>

        {/* 文案 */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 22px',
              borderRadius: 999,
              background: BRAND.gradientSoft,
              border: '1px solid rgba(99,102,241,0.20)',
              ...fadeSlideUp(frame, 14, 20, 18),
            }}
          >
            <Icon name="shield" size={21} color={BRAND.indigo} strokeWidth={2.1} />
            <span style={{ fontSize: 21, fontWeight: 700, color: BRAND.indigo, letterSpacing: 1.4 }}>
              隐私保护
            </span>
          </div>

          <h2
            style={{
              margin: '26px 0 0',
              fontSize: 68,
              fontWeight: 800,
              letterSpacing: -1,
              color: BRAND.text,
              ...fadeSlideUp(frame, 20, 22, 26),
            }}
          >
            {COPY.privacy.title}
          </h2>

          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {COPY.privacy.bullets.map((b, i) => (
              <div
                key={b}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  ...fadeSlideUp(frame, 30 + i * 12, 22, 22),
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    backgroundColor: BRAND.blueSoft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={i === 0 ? 'eye' : 'zap'} size={23} color={BRAND.blue} />
                </div>
                <span style={{ fontSize: 28, fontWeight: 500, color: BRAND.textSub }}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>

      {/* ============ 下半幕 ============ */}
      <AbsoluteFill
        style={{
          opacity: partB,
          padding: '0 180px',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 62,
            fontWeight: 800,
            letterSpacing: -0.8,
            color: BRAND.text,
            ...fadeSlideUp(frame, 124, 22, 26),
          }}
        >
          {COPY.privacy.dataTitle}
        </h2>

        <div
          style={{
            marginTop: 56,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 34,
          }}
        >
          {COPY.privacy.dataItems.map((item, i) => {
            const appear = springScale(frame, fps, 138 + i * 10, {
              damping: 90,
              stiffness: 190,
            });
            return (
              <div
                key={item.title}
                style={{
                  padding: '38px 34px',
                  borderRadius: 24,
                  backgroundColor: BRAND.surface,
                  border: `1.5px solid ${BRAND.border}`,
                  boxShadow: '0 12px 34px rgba(15,23,42,0.06)',
                  opacity: range(frame, [138 + i * 10, 154 + i * 10], [0, 1]),
                  transform: `translateY(${range(
                    frame,
                    [138 + i * 10, 160 + i * 10],
                    [34, 0],
                  )}px) scale(${0.96 + appear * 0.04}) translateY(${float(
                    frame,
                    3,
                    100,
                    i * 1.1,
                  )}px)`,
                }}
              >
                <div
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: 21,
                    background: BRAND.gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 12px 26px rgba(99,102,241,0.30)',
                  }}
                >
                  <Icon name={DATA_ICONS[i]} size={34} color="#FFFFFF" strokeWidth={2} />
                </div>
                <div
                  style={{
                    marginTop: 28,
                    fontSize: 32,
                    fontWeight: 700,
                    color: BRAND.text,
                    letterSpacing: -0.3,
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    marginTop: 14,
                    fontSize: 22,
                    lineHeight: 1.55,
                    color: BRAND.textSub,
                  }}
                >
                  {item.desc}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 46,
            fontSize: 25,
            fontWeight: 500,
            color: BRAND.textMuted,
            letterSpacing: 0.4,
            ...fadeSlideUp(frame, 176, 24, 20),
          }}
        >
          不绑定平台，不锁定格式 —— 随时可以整包带走。
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
