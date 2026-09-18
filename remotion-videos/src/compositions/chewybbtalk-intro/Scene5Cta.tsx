import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BRAND, COPY, FONT_MONO, FONT_SANS, TIMING } from '../../theme';
import {
  cursorOpacity,
  fadeSlideUp,
  float,
  range,
  sceneOpacity,
  springScale,
  typewriter,
  useAnim,
} from '../../anim';
import { Icon, LogoMark } from '../../components/Icon';

const DURATION = 205;
const TYPE_START = 16;
const CHAR_FRAMES = 0.9;

export const Scene5Cta: React.FC = () => {
  const { frame, fps } = useAnim();
  // 唯一带结尾淡出的场景：让全片收得干净
  const opacity = sceneOpacity(frame, DURATION, TIMING.overlap, 12);

  const typed = typewriter(frame - TYPE_START, COPY.cta.command, CHAR_FRAMES);
  const typing = frame >= TYPE_START && typed.length < COPY.cta.command.length;
  const blink = cursorOpacity(frame);

  const cardIn = springScale(frame, fps, 4, { damping: 92, stiffness: 170 });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.bg,
        opacity,
        fontFamily: FONT_SANS,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      {/* 背景渐变光晕 */}
      <div
        style={{
          position: 'absolute',
          width: 1400,
          height: 900,
          top: '50%',
          left: '50%',
          marginLeft: -700,
          marginTop: -450 + float(frame, 16, 200, 0),
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse, rgba(99,102,241,0.20) 0%, rgba(59,130,246,0) 68%)',
          filter: 'blur(24px)',
        }}
      />

      {/* 终端卡片 */}
      <div
        style={{
          width: 1200,
          borderRadius: 20,
          backgroundColor: BRAND.terminalBg,
          border: `1px solid ${BRAND.terminalBorder}`,
          boxShadow: '0 30px 70px rgba(2,6,23,0.42)',
          overflow: 'hidden',
          opacity: range(frame, [4, 20], [0, 1]),
          transform: `translateY(${range(frame, [4, 26], [54, 0])}px) scale(${
            0.94 + cardIn * 0.06
          })`,
        }}
      >
        {/* 窗口标题栏 */}
        <div
          style={{
            height: 54,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '0 22px',
            borderBottom: `1px solid ${BRAND.terminalBorder}`,
          }}
        >
          <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#FF5F57' }} />
          <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#FEBC2E' }} />
          <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#28C840' }} />
          <span
            style={{
              marginLeft: 14,
              fontFamily: FONT_MONO,
              fontSize: 19,
              color: BRAND.terminalComment,
            }}
          >
            bash
          </span>
        </div>

        {/* 终端正文 */}
        <div style={{ padding: '30px 36px 34px', fontFamily: FONT_MONO }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 25 }}>
            <span style={{ color: BRAND.terminalPrompt, marginRight: 12 }}>$</span>
            <span style={{ color: BRAND.terminalText, whiteSpace: 'nowrap' }}>{typed}</span>
            {(typing || frame < TYPE_START + 12) && (
              <span
                style={{
                  display: 'inline-block',
                  width: 13,
                  height: 26,
                  marginLeft: 3,
                  backgroundColor: '#F1F5F9',
                  opacity: blink,
                }}
              />
            )}
          </div>

          {/* 执行结果 */}
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 23,
              color: BRAND.green,
              ...fadeSlideUp(frame, 76, 18, 12),
            }}
          >
            <Icon name="check" size={24} color={BRAND.green} strokeWidth={2.8} />
            <span>{COPY.cta.output}</span>
          </div>
        </div>
      </div>

      {/* 主标题 */}
      <h2
        style={{
          margin: '50px 0 0',
          fontSize: 50,
          fontWeight: 800,
          letterSpacing: -0.6,
          color: BRAND.text,
          textAlign: 'center',
          ...fadeSlideUp(frame, 84, 22, 26),
        }}
      >
        {COPY.cta.headline}
      </h2>

      {/* 仓库信息 */}
      <div
        style={{
          marginTop: 36,
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          ...fadeSlideUp(frame, 96, 22, 22),
        }}
      >
        <LogoMark size={46} radius={14} iconSize={24} />
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 27,
            fontWeight: 600,
            color: BRAND.textSub,
          }}
        >
          {COPY.cta.repo}
        </span>
        <div style={{ width: 1, height: 26, backgroundColor: BRAND.border }} />
        <span style={{ fontSize: 23, fontWeight: 600, color: BRAND.textMuted }}>
          {COPY.cta.license}
        </span>
      </div>
    </AbsoluteFill>
  );
};
