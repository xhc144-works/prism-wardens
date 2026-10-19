import type { MapDef } from '../types';

export const MAPS: MapDef[] = [
  {
    id: 'verdant_plains',
    name: '翠光平原',
    theme: 'day',
    rows: 5,
    cols: 9,
    terrain: ['vgggggggg', 'ggggggggg', 'vgggggggg', 'ggggggggg', 'vgggggggg'],
  },
  {
    id: 'verdant_ridge',
    name: '翠光高岗',
    theme: 'day',
    rows: 5,
    cols: 9,
    terrain: ['vgggggggg', 'ghhgggggg', 'vgggggggg', 'ghhgggggg', 'vgggggggg'],
    nodes: [{ row: 2, col: 4 }],
  },
  {
    id: 'moonwood',
    name: '月影森林',
    theme: 'night',
    rows: 5,
    cols: 9,
    terrain: ['ggggggggg', 'vgggggggg', 'ggggggggg', 'vgggggggg', 'ggggggggg'],
    tombs: [
      { row: 0, col: 6 },
      { row: 2, col: 7 },
      { row: 4, col: 5 },
    ],
  },
  {
    id: 'moonwood_deep',
    name: '幽林深处',
    theme: 'night',
    rows: 5,
    cols: 9,
    terrain: ['ggggggbgg', 'vgggggggg', 'gggggbggg', 'vgggggggg', 'ggggggbgg'],
    tombs: [
      { row: 1, col: 6 },
      { row: 3, col: 7 },
      { row: 0, col: 8 },
      { row: 4, col: 7 },
    ],
  },
  {
    id: 'spring_lake',
    name: '灵泉湖畔',
    theme: 'lake',
    rows: 6,
    cols: 9,
    terrain: ['vgggggggg', 'ggggggggg', 'wwwwwwwww', 'wwwwwwwww', 'ggggggggg', 'vgggggggg'],
  },
  {
    id: 'fog_marsh',
    name: '迷雾沼泽',
    theme: 'fog',
    rows: 6,
    cols: 9,
    terrain: ['ggggggbgg', 'vgggggggg', 'wwwwwwwww', 'wwwwwwwww', 'vgggggggg', 'ggggggbgg'],
    tombs: [
      { row: 0, col: 7 },
      { row: 5, col: 6 },
    ],
  },
  {
    id: 'sky_ruins',
    name: '浮空遗迹',
    theme: 'sky',
    rows: 5,
    cols: 9,
    terrain: ['vgghgggrg', 'gggggiiig', 'vhgggggrg', 'gggggiiig', 'vgghgggrg'],
    arrows: [],
    nodes: [{ row: 2, col: 3 }],
  },
  {
    id: 'sky_spire',
    name: '天穹尖塔',
    theme: 'sky',
    rows: 5,
    cols: 10,
    terrain: ['vgghggbggg', 'gggrgggiig', 'vhggggggig', 'gggrgggiig', 'vgghggbggg'],
    arrows: [
      { row: 0, col: 8, dir: 1 },
      { row: 4, col: 8, dir: -1 },
    ],
    nodes: [
      { row: 1, col: 1 },
      { row: 3, col: 1 },
    ],
  },
  {
    id: 'arena_open',
    name: '训练场',
    theme: 'day',
    rows: 5,
    cols: 9,
    terrain: ['ggggggggg', 'ggggggggg', 'ggggggggg', 'ggggggggg', 'ggggggggg'],
  },
];

export function makeBlankMap(id: string, rows = 5, cols = 9, theme: MapDef['theme'] = 'day'): MapDef {
  return {
    id,
    name: '新地图',
    theme,
    rows,
    cols,
    terrain: Array.from({ length: rows }, () => 'g'.repeat(cols)),
    arrows: [],
    nodes: [],
    tombs: [],
    preplaced: [],
    custom: true,
  };
}
