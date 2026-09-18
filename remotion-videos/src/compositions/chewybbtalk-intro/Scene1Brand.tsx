import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BRAND, COPY, FONT_SANS } from '../../theme';
import { fadeSlideUp, float, range, sceneOpacity, springScale, useAnim } from '../../anim';
import { LogoMark, Icon } from '../../components/Icon';

const DURATION = 75;

export const Scene1Brand: React.FC = () => {
  const { frame, fps } = useAnim();
  const opacity = sceneOpacity(frame, DURATION);

  // Logo 弹入
  const logoScale = springScale(frame, fps, 2, { damping: 70, stiffness: 170 });
  const logoOpacity = range(frame, [2, 16], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.bg,
        opacity,
        fontFamily: FONT_SANS,
        overflow: 'hidden',
      }}
    >
      {/* 背景：两团缓慢漂移的渐变光斑 */}
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          left: -140 + float(frame, 26, 210, 0),
          top: -300 + float(frame, 22, 260, 1.2),
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(59,130,246,0.30) 0%, rgba(59,130,246,0) 68%)',
          filter: 'blur(30px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 980,
          height: 980,
          right: -200 + float(frame, 30, 240, 2.4),
          bottom: -380 + float(frame, 24, 200, 0.6),
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(139,92,246,0.30) 0%, rgba(139,92,246,0) 68%)',
          filter: 'blur(30px)',
        }}
      />

      {/* 右上角开源徽标 */}
      <div
        style={{
          position: 'absolute',
          top: 62,
          right: 78,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 22px',
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.86)',
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
          ...fadeSlideUp(frame, 22, 20, -14),
        }}
      >
        <Icon name="github" size={20} color={BRAND.textSub} />
        <span style={{ fontSize: 20, fontWeight: 600, color: BRAND.textSub, letterSpacing: 0.3 }}>
          {COPY.brand.badge}
        </span>
      </div>

      {/* 主体 */}
      <AbsoluteFill
        style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}
      >
        <div style={{ opacity: logoOpacity, transform: `scale(${logoScale})` }}>
          <LogoMark size={116} radius={34} iconSize={58} />
        </div>

        <h1
          style={{
            margin: '40px 0 0',
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: -1.5,
            color: BRAND.text,
            ...fadeSlideUp(frame, 16, 22, 34),
          }}
        >
          {COPY.brand.title}
        </h1>

        <div
          style={{
            marginTop: 20,
            padding: '9px 26px',
            borderRadius: 999,
            background: BRAND.gradientSoft,
            border: '1px solid rgba(99,102,241,0.20)',
            ...fadeSlideUp(frame, 26, 20, 24),
          }}
        >
          <span
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 3,
              background: BRAND.gradient,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {COPY.brand.tagline}
          </span>
        </div>

        <p
          style={{
            marginTop: 26,
            fontSize: 30,
            fontWeight: 400,
            color: BRAND.textSub,
            letterSpacing: 0.5,
            ...fadeSlideUp(frame, 36, 22, 20),
          }}
        >
          {COPY.brand.sub}
        </p>

        {/* 底部一条渐隐分割线 */}
        <div
          style={{
            marginTop: 44,
            width: 220,
            height: 3,
            borderRadius: 999,
            background: BRAND.gradient,
            opacity: range(frame, [46, 66], [0, 0.85]),
            transform: `scaleX(${range(frame, [46, 68], [0.2, 1])})`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
