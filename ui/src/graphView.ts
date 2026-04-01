export type GraphOrientation = 'top-down' | 'left-right' | 'bottom-up' | 'right-left';

export type GraphLayoutMode = 'preserve' | 'directional' | 'radial';

type Point = {
  x: number;
  y: number;
};

export function transformGraphPoint(point: Point, orientation: GraphOrientation): Point {
  switch (orientation) {
    case 'left-right':
      return { x: point.y, y: point.x };
    case 'bottom-up':
      return { x: point.x, y: -point.y };
    case 'right-left':
      return { x: -point.y, y: point.x };
    case 'top-down':
    default:
      return { x: point.x, y: point.y };
  }
}

export function positionAlongOrientation(
  anchor: Point,
  depthOffset: number,
  crossOffset: number,
  orientation: GraphOrientation
): Point {
  switch (orientation) {
    case 'left-right':
      return {
        x: anchor.x + depthOffset,
        y: anchor.y + crossOffset,
      };
    case 'bottom-up':
      return {
        x: anchor.x + crossOffset,
        y: anchor.y - depthOffset,
      };
    case 'right-left':
      return {
        x: anchor.x - depthOffset,
        y: anchor.y + crossOffset,
      };
    case 'top-down':
    default:
      return {
        x: anchor.x + crossOffset,
        y: anchor.y + depthOffset,
      };
  }
}
