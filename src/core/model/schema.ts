import { z } from 'zod';

/**
 * Editor document JSON (structurally compatible with TipTap's JSONContent).
 * Defined here instead of importing JSONContent because that type contains `any`
 * and src/core must not depend on the editor library.
 * Unknown keys are kept so that export -> import round trips lose nothing.
 */
export interface DocMark {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  [key: string]: unknown;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  content?: DocNode[] | undefined;
  marks?: DocMark[] | undefined;
  text?: string | undefined;
  [key: string]: unknown;
}

export const docMarkSchema: z.ZodType<DocMark> = z.looseObject({
  type: z.string().min(1),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

export const docNodeSchema: z.ZodType<DocNode> = z.looseObject({
  type: z.string().min(1),
  attrs: z.record(z.string(), z.unknown()).optional(),
  get content() {
    return z.array(docNodeSchema).optional();
  },
  marks: z.array(docMarkSchema).optional(),
  text: z.string().optional(),
});

/** Root of the document body. */
export const docRootSchema = z.looseObject({
  type: z.literal('doc'),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.array(docNodeSchema).optional(),
});

const isoDateSchema = z.iso.date();

export const docMetaSchema = z.object({
  title: z.string(),
  projectName: z.string(),
  version: z.string(),
  date: isoDateSchema,
  companyName: z.string(),
  clientName: z.string().optional(),
});

export const revisionSchema = z.object({
  id: z.string().min(1),
  version: z.string(),
  date: isoDateSchema,
  description: z.string(),
  author: z.string(),
});

export const pageSizeSchema = z.enum(['A4', 'A3', 'B4', 'custom']);
export const pageOrientationSchema = z.enum(['portrait', 'landscape']);
export const pageMarginSchema = z.enum(['narrow', 'normal', 'wide']);

export const CUSTOM_PAGE_MM_MIN = 100;
export const CUSTOM_PAGE_MM_MAX = 1000;
export const BASE_FONT_PT_MIN = 9;
export const BASE_FONT_PT_MAX = 12;

const customMmLength = z.number().min(CUSTOM_PAGE_MM_MIN).max(CUSTOM_PAGE_MM_MAX);

export const pageSettingsSchema = z
  .object({
    size: pageSizeSchema,
    orientation: pageOrientationSchema,
    customMm: z.object({ width: customMmLength, height: customMmLength }).optional(),
    margin: pageMarginSchema,
    baseFontPt: z.number().min(BASE_FONT_PT_MIN).max(BASE_FONT_PT_MAX),
  })
  .refine((page) => page.size !== 'custom' || page.customMm !== undefined, {
    message: 'size が "custom" のときは customMm が必要です',
    path: ['customMm'],
  });

export const tocDepthSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const themeSettingsSchema = z.object({
  logoDataUri: z.string().startsWith('data:image/').optional(),
  copyright: z.string().optional(),
  tocDepth: tocDepthSchema,
  page: pageSettingsSchema,
});

export const themeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  builtIn: z.boolean(),
  baseId: z.string().min(1).optional(),
  css: z.string(),
  settings: themeSettingsSchema,
});

export const documentStateSchema = z.object({
  doc: docRootSchema,
  meta: docMetaSchema,
  revisions: z.array(revisionSchema),
  themeId: z.string().min(1),
  settingsOverride: themeSettingsSchema.partial().optional(),
});

export const EMBEDDED_DATA_FORMAT = 'tiptap-spec-doc';
export const EMBEDDED_DATA_VERSION = 1;

export const embeddedDataSchema = z.object({
  format: z.literal(EMBEDDED_DATA_FORMAT),
  version: z.literal(EMBEDDED_DATA_VERSION),
  state: documentStateSchema,
  theme: themeSchema,
});
