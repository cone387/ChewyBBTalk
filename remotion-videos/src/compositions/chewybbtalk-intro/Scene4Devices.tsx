import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BRAND, COPY, FONT_SANS } from '../../theme';
import { fadeSlideUp, float, range, sceneOpacity, springScale, useAnim } from '../../anim';
import { Icon, IconName } from '../../components/Icon';

const DURATION = 205;
const DEVICE_ICONS: IconName[] = ['monitor', 'smartphone', 'zap'];

const Line: React.FC<{ w: number; h?: number; color?: string; mb?: number }> = ({
  w,
  h = 9,
  color = '#E2E8F0',
  mb = 10,
}) => (
  <div
    style={{
      width: w,
      height: h,
      borderRadius: 999,
      backgroundColor: color,
      marginBottom: mb,
    }}
  />
);

/** 浏览器窗口示意 */
const BrowserMock: React.FC = () => (
  <div
    style={{
      width: 372,
      borderRadius: 15,
      border: `1.5px solid ${BRAND.border}`,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      boxShadow: '0 10px 26px rgba(15,23,42,0.07)',
    }}
  >
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 14px',
        backgroundColor: BRAND.surfaceAlt,
        borderBottom: `1px solid ${BRAND.border}`,
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
      <div
        style={{
          flex: 1,
          marginLeft: 8,
          height: 22,
          borderRadius: 999,
          backgroundColor: '#FFFFFF',
          border: `1px solid ${BRAND.border}`,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 12,
        }}
      >
        <span style={{ fontFamily: 'monospace', fontSize: 14, color: BRAND.textMuted }}>
          {COPY.devices.items[0].addr}
        </span>
      </div>
    </div>
    <div style={{ padding: 20 }}>
      <Line w={330} h={10} color="#CBD5E1" />
      <Line w={250} />
      <Line w={300} />
      <Line w={190} mb={0} />
    </div>
  </div>
);

/** 手机示意 */
const PhoneMock: React.FC = () => (
  <div
    style={{
      width: 168,
      height: 296,
      borderRadius: 26,
      border: `2.5px solid ${BRAND.text}`,
      backgroundColor: '#FFFFFF',
      position: 'relative',
      boxShadow: '0 10px 26px rgba(15,23,42,0.10)',
      padding: '26px 14px 14px',
      boxSizing: 'border-box',
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        marginLeft: -22,
        width: 44,
        height: 7,
        borderRadius: 999,
        backgroundColor: BRAND.text,
      }}
    />
    <Line w={110} h={8} color="#CBD5E1" />
    <Line w={82} h={8} />
    <Line w={124} h={8} />
    <Line w={96} h={8} />
    <div
      style={{
        position: 'absolute',
        bottom: 14,
        left: 14,
        right: 14,
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            backgroundColor: i === 0 ? BRAND.indigo : '#E2E8F0',
          }}
        />
      ))}
    </div>
  </div>
);

/** 桌面悬浮球示意 */
const DesktopMock: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
    <div style={{ position: 'relative', width: 300, height: 150 }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 22,
          width: 106,
          height: 106,
          borderRadius: '50%',
          background: BRAND.gradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 14px 32px rgba(99,102,241,0.38)',
        }}
      >
        <Icon name="chat" size={50} color="#FFFFFF" strokeWidth={2.1} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 122,
          top: 34,
          width: 176,
          padding: '14px 18px',
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          border: `1.5px solid ${BRAND.border}`,
          boxShadow: '0 10px 24px rgba(15,23,42,0.09)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: BRAND.indigo,
            }}
          />
          <span style={{ fontSize: 15, fontWeight: 600, color: BRAND.textMuted }}>刚刚</span>
        </div>
        <Line w={132} h={7} color="#CBD5E1" mb={8} />
        <Line w={98} h={7} mb={0} />
      </div>
    </div>
    <div
      style={{
        padding: '9px 20px',
        borderRadius: 11,
        backgroundColor: BRAND.surfaceAlt,
        border: `1px solid ${BRAND.border}`,
        fontFamily: 'monospace',
        fontSize: 19,
        fontWeight: 600,
        color: BRAND.textSub,
      }}
    >
      {COPY.devices.items[2].addr}
    </div>
  </div>
);

const MOCKS: React.FC[] = [BrowserMock, PhoneMock, DesktopMock];

export const Scene4Devices: React.FC = () => {
  const { frame, fps } = useAnim();
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
      <div
        style={{
          position: 'absolute',
          width: 1200,
          height: 760,
          bottom: -340 + float(frame, 18, 220, 0),
          left: '50%',
          marginLeft: -600,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse, rgba(139,92,246,0.16) 0%, rgba(139,92,246,0) 70%)',
          filter: 'blur(20px)',
        }}
      />

      <h2
        style={{
          margin: 0,
          fontSize: 62,
          fontWeight: 800,
          letterSpacing: -0.8,
          color: BRAND.text,
          ...fadeSlideUp(frame, 8, 22, 26),
        }}
      >
        {COPY.devices.title}
      </h2>

      <div
        style={{
          marginTop: 54,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 40,
        }}
      >
        {COPY.devices.items.map((item, i) => {
          const Mock = MOCKS[i];
          const start = 36 + i * 12;
          const appear = springScale(frame, fps, start, { damping: 85, stiffness: 180 });
          // 顺序脉冲：强调"三端同步同一份记录"
          const pulseStart = 128 + i * 18;
          const pulse = Math.min(
            range(frame, [pulseStart, pulseStart + 10], [0, 1]),
            range(frame, [pulseStart + 10, pulseStart + 32], [1, 0]),
          );
          return (
            <div
              key={item.title}
              style={{
                height: 424,
                boxSizing: 'border-box',
                padding: '28px 26px 24px',
                borderRadius: 26,
                backgroundColor: BRAND.surface,
                border: `1.5px solid ${pulse > 0.5 ? 'rgba(99,102,241,0.6)' : BRAND.border}`,
                boxShadow:
                  pulse > 0.02
                    ? `0 ${16 + pulse * 16}px ${36 + pulse * 26}px rgba(99,102,241,${
                        0.12 + pulse * 0.28
                      })`
                    : '0 12px 32px rgba(15,23,42,0.06)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity: range(frame, [start, start + 18], [0, 1]),
                transform: `translateY(${range(
                  frame,
                  [start, start + 24],
                  [40, 0],
                )}px) scale(${0.94 + appear * 0.06}) translateY(${float(
                  frame,
                  3,
                  110,
                  i * 1.2,
                )}px)`,
              }}
            >
              {/* 设备名 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <Icon
                  name={DEVICE_ICONS[i]}
                  size={24}
                  color={BRAND.indigo}
                  strokeWidth={2.1}
                />
                <span style={{ fontSize: 25, fontWeight: 700, color: BRAND.text }}>
                  {item.title}
                </span>
              </div>

              {/* 设备示意 */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                }}
              >
                <Mock />
              </div>

              <div
                style={{
                  marginTop: 18,
                  fontSize: 21,
                  fontWeight: 500,
                  color: BRAND.textSub,
                  textAlign: 'center',
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
          marginTop: 42,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          ...fadeSlideUp(frame, 118, 24, 22),
        }}
      >
        <div style={{ width: 34, height: 3, borderRadius: 999, background: BRAND.gradient }} />
        <span style={{ fontSize: 26, fontWeight: 500, color: BRAND.textSub, letterSpacing: 0.4 }}>
          {COPY.devices.footer}
        </span>
      </div>
    </AbsoluteFill>
  );
};
