import React from 'react';
import { Composition } from 'remotion';
import { loadFonts } from './brand';
import { IMPORT_KINDS, ONE_NUMBER_KINDS, PRODUCT_KINDS, Video } from './scenes';
import { FPS, frames, importVideo, lengthOf, oneNumber, product } from './timeline';

loadFonts();

export const Root: React.FC = () => (
  <>
    <Composition id="OneNumber" component={() => <Video scenes={oneNumber} kinds={ONE_NUMBER_KINDS} />} durationInFrames={frames(lengthOf(oneNumber))} fps={FPS} width={1920} height={1080} />
    <Composition id="Import" component={() => <Video scenes={importVideo} kinds={IMPORT_KINDS} />} durationInFrames={frames(lengthOf(importVideo))} fps={FPS} width={1920} height={1080} />
    <Composition id="Product" component={() => <Video scenes={product} kinds={PRODUCT_KINDS} />} durationInFrames={frames(lengthOf(product))} fps={FPS} width={1920} height={1080} />
    <Composition id="ProductVertical" component={() => <Video scenes={product} kinds={PRODUCT_KINDS} />} durationInFrames={frames(lengthOf(product))} fps={FPS} width={1080} height={1350} />
  </>
);
