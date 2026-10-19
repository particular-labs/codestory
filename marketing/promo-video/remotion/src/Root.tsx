import React from 'react';
import {Composition} from 'remotion';
import {Promo, TOTAL} from './scenes';

export const Root: React.FC = () => (
  <Composition
    id="Promo"
    component={Promo}
    durationInFrames={TOTAL}
    fps={30}
    width={1920}
    height={1080}
  />
);
