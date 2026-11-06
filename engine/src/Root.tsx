import React from 'react';
import {Composition} from 'remotion';
import {GpsReel, GPS_DURATION} from './GpsReel';
import {MemsReel, MEMS_DURATION} from './MemsReel';
export const Root: React.FC = () => (<>
  <Composition id="GpsReel" component={GpsReel} durationInFrames={GPS_DURATION} fps={30} width={1080} height={1920} />
  <Composition id="MemsReel" component={MemsReel} durationInFrames={MEMS_DURATION} fps={30} width={1080} height={1920} />
</>);
