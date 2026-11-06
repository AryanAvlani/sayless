import React from 'react';
import {Composition} from 'remotion';
import {GpsReel, GPS_DURATION} from './GpsReel';
import {MemsReel, MEMS_DURATION} from './MemsReel';
import {TouchReel, TOUCH_DURATION} from './TouchReel';
import {TapReel, TAP_DURATION} from './TapReel';
import {ChargerReel, CHARGER_DURATION} from './ChargerReel';
export const Root: React.FC = () => (<>
  <Composition id="GpsReel" component={GpsReel} durationInFrames={GPS_DURATION} fps={30} width={1080} height={1920} />
  <Composition id="MemsReel" component={MemsReel} durationInFrames={MEMS_DURATION} fps={30} width={1080} height={1920} />
  <Composition id="TouchReel" component={TouchReel} durationInFrames={TOUCH_DURATION} fps={30} width={1080} height={1920} />
  <Composition id="TapReel" component={TapReel} durationInFrames={TAP_DURATION} fps={30} width={1080} height={1920} />
  <Composition id="ChargerReel" component={ChargerReel} durationInFrames={CHARGER_DURATION} fps={30} width={1080} height={1920} />
</>);
