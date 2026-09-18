import React from 'react';
import { Composition } from 'remotion';
import { ChewyBBTalkIntro } from './compositions/chewybbtalk-intro/VideoComposition';
import { TIMING } from './theme';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="chewybbtalk-intro"
        component={ChewyBBTalkIntro}
        durationInFrames={TIMING.total}
        fps={TIMING.fps}
        width={TIMING.width}
        height={TIMING.height}
      />
    </>
  );
};
