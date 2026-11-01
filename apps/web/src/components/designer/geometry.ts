import { CARD_W, HEAD_H, ROW_H } from '../../domain/designer';

export interface Point { x: number; y: number }
export type Side = 'left' | 'right';

/** Vertical centre of a column row inside its card. */
export const rowCenter = (columnIndex: number) => HEAD_H + columnIndex * ROW_H + ROW_H / 2;

export const anchor = (pos: Point, columnIndex: number, side: Side): Point => ({ x: pos.x + (side === 'right' ? CARD_W : 0), y: pos.y + rowCenter(columnIndex) });

/** Parent key on the side facing the child; the child's reference leaves from the side facing the parent. */
export function linePoints(parent: Point, parentCol: number, child: Point, childCol: number) {
  const childIsRight = child.x + CARD_W / 2 > parent.x + CARD_W / 2;
  const pSide: Side = childIsRight ? 'right' : 'left';
  const cSide: Side = childIsRight ? 'left' : 'right';
  return { p: anchor(parent, parentCol, pSide), c: anchor(child, childCol, cSide), pSide, cSide };
}

export function curve(p: Point, c: Point, pSide: Side, cSide: Side): string {
  const dx = Math.max(40, Math.abs(c.x - p.x) / 2);
  const p1 = p.x + (pSide === 'right' ? dx : -dx);
  const c1 = c.x + (cSide === 'right' ? dx : -dx);
  return `M${p.x} ${p.y} C${p1} ${p.y}, ${c1} ${c.y}, ${c.x} ${c.y}`;
}

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
