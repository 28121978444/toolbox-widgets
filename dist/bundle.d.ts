export declare const BUNDLE_FORMAT = "toolbox-widgets";
export declare const BUNDLE_FORMAT_VERSION = 1;
export declare const WIDGET_IDS: readonly ["crypto-watch", "gmail-announcer", "resource-monitor"];
export type WidgetId = (typeof WIDGET_IDS)[number];
export interface WidgetBundleEntry {
    widget: WidgetId;
    settings: Record<string, unknown>;
    /** Vault key reference for credentials — resolved by the importing app, never exported. */
    credentialsRef?: string;
}
export interface WidgetBundle {
    format: typeof BUNDLE_FORMAT;
    formatVersion: typeof BUNDLE_FORMAT_VERSION;
    exportedAt: string;
    widgets: WidgetBundleEntry[];
}
/** Validate and normalize a bundle. Throws with a friendly message when invalid. */
export declare function parseBundle(value: unknown): WidgetBundle;
/** Parse a bundle from JSON text. */
export declare function parseBundleJson(text: string): WidgetBundle;
/** Serialize entries to a portable JSON bundle. */
export declare function serializeBundle(entries: WidgetBundleEntry[], now?: Date): string;
