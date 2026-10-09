import type { z } from 'zod';
import type {
  docMetaSchema,
  docRootSchema,
  documentStateSchema,
  embeddedDataSchema,
  pageSettingsSchema,
  revisionSchema,
  themeSchema,
  themeSettingsSchema,
} from './schema';

export type { DocMark, DocNode } from './schema';

export type DocRoot = z.infer<typeof docRootSchema>;
export type DocMeta = z.infer<typeof docMetaSchema>;
export type Revision = z.infer<typeof revisionSchema>;
export type PageSettings = z.infer<typeof pageSettingsSchema>;
export type ThemeSettings = z.infer<typeof themeSettingsSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type DocumentState = z.infer<typeof documentStateSchema>;
export type EmbeddedData = z.infer<typeof embeddedDataSchema>;
