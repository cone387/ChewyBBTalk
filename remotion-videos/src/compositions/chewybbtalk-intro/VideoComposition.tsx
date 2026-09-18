import React from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from 'remotion';
import { BRAND, SCENES, TIMING } from '../../theme';
import { Scene1Brand } from './Scene1Brand';
import { Scene2Features } from './Scene2Features';
import { Scene3Privacy } from './Scene3Privacy';
import { Scene4Devices } from './Scene4Devices';
import { Scene5Cta } from './Scene5Cta';

/** 背景音乐音量：0 → 峰值 → 收尾淡出。peak 越低越"垫底"。 */
const BGM_PEAK = 0.38;

const bgmVolume = (frame: number) => {
  const fadeIn = interpolate(frame, [0, 45], [0, BGM_PEAK], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [TIMING.total - 105, TIMING.total], [BGM_PEAK, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return Math.min(fadeIn, fadeOut);
};

/**
 * ChewyBBTalk 介绍视频 · 主时间线
 * 相邻场景有 15 帧重叠，重叠区由各场景自身的透明度包络完成交叉溶解。
 */
export const ChewyBBTalkIntro: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <Audio src={staticFile('music/bgm-30s.m4a')} volume={bgmVolume} />
      <Sequence
        from={SCENES.s1_brand.from}
        durationInFrames={SCENES.s1_brand.duration}
        name="1 · 品牌开场"
      >
        <Scene1Brand />
      </Sequence>

      <Sequence
        from={SCENES.s2_features.from}
        durationInFrames={SCENES.s2_features.duration}
        name="2 · 核心功能"
      >
        <Scene2Features />
      </Sequence>

      <Sequence
        from={SCENES.s3_privacy.from}
        durationInFrames={SCENES.s3_privacy.duration}
        name="3 · 隐私与数据自主"
      >
        <Scene3Privacy />
      </Sequence>

      <Sequence
        from={SCENES.s4_devices.from}
        durationInFrames={SCENES.s4_devices.duration}
        name="4 · 三端协同"
      >
        <Scene4Devices />
      </Sequence>

      <Sequence
        from={SCENES.s5_cta.from}
        durationInFrames={SCENES.s5_cta.duration}
        name="5 · 部署与 CTA"
      >
        <Scene5Cta />
      </Sequence>
    </AbsoluteFill>
  );
};
