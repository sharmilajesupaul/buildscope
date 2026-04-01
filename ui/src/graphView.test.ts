import { describe, expect, it } from 'vitest';
import { positionAlongOrientation, transformGraphPoint } from './graphView';

describe('transformGraphPoint', () => {
  it('keeps top-down coordinates unchanged', () => {
    expect(transformGraphPoint({ x: 12, y: 34 }, 'top-down')).toEqual({ x: 12, y: 34 });
  });

  it('rotates top-down layouts into left-right layouts', () => {
    expect(transformGraphPoint({ x: -24, y: 80 }, 'left-right')).toEqual({ x: 80, y: -24 });
  });

  it('mirrors vertical depth for bottom-up layouts', () => {
    expect(transformGraphPoint({ x: 10, y: 90 }, 'bottom-up')).toEqual({ x: 10, y: -90 });
  });

  it('reverses depth for right-left layouts', () => {
    expect(transformGraphPoint({ x: -16, y: 48 }, 'right-left')).toEqual({ x: -48, y: -16 });
  });
});

describe('positionAlongOrientation', () => {
  it('projects directional focus vertically in top-down mode', () => {
    expect(positionAlongOrientation({ x: 100, y: 200 }, 60, -20, 'top-down')).toEqual({
      x: 80,
      y: 260,
    });
  });

  it('projects directional focus horizontally in left-right mode', () => {
    expect(positionAlongOrientation({ x: 100, y: 200 }, 60, -20, 'left-right')).toEqual({
      x: 160,
      y: 180,
    });
  });

  it('reverses the depth axis in bottom-up mode', () => {
    expect(positionAlongOrientation({ x: 100, y: 200 }, 60, -20, 'bottom-up')).toEqual({
      x: 80,
      y: 140,
    });
  });

  it('reverses the depth axis in right-left mode', () => {
    expect(positionAlongOrientation({ x: 100, y: 200 }, 60, -20, 'right-left')).toEqual({
      x: 40,
      y: 180,
    });
  });
});
