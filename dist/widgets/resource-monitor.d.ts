export interface ResourceStats {
    cpuPercent: number;
    memUsed: number;
    memTotal: number;
    diskFree: number;
    diskTotal: number;
    diskName: string;
    uptime: number;
    hostname: string;
    platform: string;
    cpuModel: string;
    cores: number;
}
export interface TopProcess {
    name: string;
    pid: number;
    cpu: number | null;
    memMb: number;
}
export interface ResourceMonitorOptions {
    /** Disk to report on, e.g. 'C:\\' on Windows or '/' on Linux. */
    diskPath?: string;
    /** How many top processes to return (Windows only). Default 10. */
    topProcessCount?: number;
}
export interface ResourceMonitorSettings {
    diskPath?: string;
    showProcesses?: boolean;
}
export declare function createResourceMonitor(options?: ResourceMonitorOptions): {
    getStats: () => Promise<ResourceStats>;
    getTopProcesses: () => Promise<TopProcess[]>;
};
/** Validate portable settings for the bundle format. */
export declare function validateResourceSettings(value: unknown): ResourceMonitorSettings;
