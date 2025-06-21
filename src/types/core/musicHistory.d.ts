import type { IInjectable } from "@/types/infra";

export interface IMusicHistory extends IInjectable {
    /**
     * Get current music history
     */
    readonly history: IMusic.IMusicItem[];
    
    /**
     * Initialize music history from storage
     */
    setup(): Promise<void>;
    
    /**
     * Add a music item to history
     */
    addMusic(musicItem: IMusic.IMusicItem): Promise<void>;
    
    /**
     * Remove a music item from history
     */
    removeMusic(musicItem: IMusic.IMusicItem): Promise<void>;
    
    /**
     * Clear all music history
     */
    clearMusic(): Promise<void>;
    
    /**
     * Set new music history
     */
    setHistory(newHistory: IMusic.IMusicItem[]): Promise<void>;
}
