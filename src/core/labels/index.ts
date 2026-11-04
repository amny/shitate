export {
  computeLabels,
  DEFAULT_NUMBERING_START_LEVEL,
  formatRef,
  resolveNumberingStartLevel,
} from './computeLabels';
export type {
  CaptionLabel,
  ComputeLabelsOptions,
  HeadingLabel,
  Labels,
  NumberingStartLevel,
  TocEntry,
} from './computeLabels';
export { generateStableId, isValidStableId, STABLE_ID_PREFIXES } from './stableIds';
