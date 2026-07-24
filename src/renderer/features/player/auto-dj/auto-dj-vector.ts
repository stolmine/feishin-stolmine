import {
    recommenderSessionNext,
    type SessionNextParams,
} from '/@/renderer/features/player/auto-dj/recommender-api';
import { type QueueSong } from '/@/shared/types/domain-types';

export type AutoDjVectorArgs = {
    count: number;
    currentSong: QueueSong;
    // full current queue ids — avoid re-queueing anything already present
    excludeIds: string[];
    params: SessionNextParams;
    // recent context ids, most-recent last (drives the session centroid)
    recentIds: string[];
    recommenderUrl: string;
};

/**
 * Vector AutoDJ collector: ask the recommender for the next batch given the session
 * context, and return the Navidrome track ids to enqueue. Mirrors the shape of
 * runAutoDjSongs / runAutoDjAlbumIds, but delegates selection to the server-side
 * retrieve→rerank→contrast engine.
 */
export const runAutoDjVector = async (args: AutoDjVectorArgs): Promise<string[]> => {
    const response = await recommenderSessionNext(args.recommenderUrl, {
        count: args.count,
        exclude: args.excludeIds,
        params: args.params,
        recent: args.recentIds,
        seeds: [args.currentSong.id],
    });

    return response.tracks ?? [];
};
