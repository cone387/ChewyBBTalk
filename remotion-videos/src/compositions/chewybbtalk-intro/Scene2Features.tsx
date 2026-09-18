import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BRAND, COPY, FONT_SANS } from '../../theme';
import { fadeSlideUp, float, range, sceneOpacity, staggerItem, useAnim } from '../../anim';
import { Icon, IconName } from '../../components/Icon';

const DURATION = 240;
const CARD_ICONS: IconName[] = ['pencil', 'tag', 'paperclip', 'comment', 'search', 'eye'];

/** 逐张卡片的高亮扫过（0 → 1 → 0） */
const spotlight = (frame: number, index: number, start = 96, step = 22) => {
  const s = start + index * step;
  return Math.min(
    range(frame, [s - 8, s + 4], [0, 1]),
    range(frame, [s + step - 6, s + step + 6], [1, 0]),
  );
};

export const Scene2Features: React.FC = () => {
  const { frame } = useAnim();
  const opacity = sceneOpacity(frame, DURATION);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.bg,
        opacity,
        fontFamily: FONT_SANS,
        overflow: 'hidden',
        padding: '0 180px',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      {/* 背景柔光 */}
      <div
        style={{
          position: 'absolute',
          width: 1100,
          height: 700,
          top: -260 + float(frame, 18, 200, 0),
          left: '50%',
          marginLeft: -550,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse, rgba(99,102,241,0.16) 0%, rgba(99,102,241,0) 70%)',
          filter: 'blur(20px)',
        }}
      />

      {/* 标题 */}
      <div style={{ position: 'relative' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 62,
            fontWeight: 800,
            letterSpacing: -0.8,
            color: BRAND.text,
            ...fadeSlideUp(frame, 6, 22, 26),
          }}
        >
          {COPY.features.title}
        </h2>
        <p
          style={{
            margin: '16px 0 0',
            fontSize: 27,
            fontWeight: 400,
            color: BRAND.textSub,
            ...fadeSlideUp(frame, 16, 22, 20),
          }}
        >
          {COPY.features.subtitle}
        </p>
      </div>

      {/* 3 x 2 功能卡片 */}
      <div
        style={{
          marginTop: 50,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 28,
        }}
      >
        {COPY.features.items.map((item, i) => {
          const hi = spotlight(frame, i);
          const tint = i % 2 === 0 ? BRAND.blue : BRAND.purple;
          const entry = staggerItem(frame, i, 10, 20, 42);
          const floating = float(frame, 3, 90, i * 1.05);
          return (
            <div
              key={item.title}
              style={{
                ...entry,
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                padding: '30px 28px',
                borderRadius: 22,
                backgroundColor: BRAND.surface,
                border: `1.5px solid ${
                  hi > 0.5 ? 'rgba(99,102,241,0.55)' : BRAND.border
                }`,
                boxShadow:
                  hi > 0.02
                    ? `0 ${14 + hi * 18}px ${34 + hi * 30}px rgba(99,102,241,${
                        0.12 + hi * 0.26
                      })`
                    : '0 6px 20px rgba(15,23,42,0.05)',
                transform: `${entry.transform} translateY(${floating - hi * 10}px) scale(${
                  1 + hi * 0.032
                })`,
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 64,
                  height: 64,
                  borderRadius: 19,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hi > 0.5 ? tint : `${tint}1F`,
                  boxShadow:
                    hi > 0.5 ? `0 10px 24px ${tint}55` : 'inset 0 0 0 1px rgba(15,23,42,0.03)',
                }}
              >
                <Icon
                  name={CARD_ICONS[i]}
                  size={31}
                  color={hi > 0.5 ? '#FFFFFF' : tint}
                  strokeWidth={2}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 29,
                    fontWeight: 700,
                    color: BRAND.text,
                    letterSpacing: -0.2,
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    marginTop: 9,
                    fontSize: 20,
                    fontWeight: 400,
                    color: BRAND.textSub,
                    lineHeight: 1.4,
                  }}
                >
                  {item.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部小结 */}
      <div
        style={{
          marginTop: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          ...fadeSlideUp(frame, 186, 24, 22),
        }}
      >
        <div
          style={{
            width: 34,
            height: 3,
            borderRadius: 999,
            background: BRAND.gradient,
          }}
        />
        <span style={{ fontSize: 26, fontWeight: 500, color: BRAND.textSub, letterSpacing: 0.4 }}>
          {COPY.features.footer}
        </span>
      </div>
    </AbsoluteFill>
  );
};
