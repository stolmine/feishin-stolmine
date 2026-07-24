import axios from 'axios';

/**
 * Thin client for the self-hosted AutoDJ recommender daemon (see autodj-server/).
 * Renderer-direct HTTP over Tailscale; the base URL is user-configured in AutoDJ settings.
 */

export interface SessionNextParams {
    allowDuplicates?: boolean;
    artistsExclude?: string[];
    artistsInclude?: string[];
    bpmMax?: number;
    bpmMin?: number;
    // 0 = maximum consistency, 1 = maximum variety.
    contrast?: number;
    genresAllow?: string[];
    genresExclude?: string[];
    lengthMaxSec?: number;
    lengthMinSec?: number;
    yearMax?: number;
    yearMin?: number;
}

export interface SessionNextRequest {
    count: number;
    exclude?: string[];
    params: SessionNextParams;
    // Navidrome track ids, most-recent last.
    recent: string[];
    seeds: string[];
}

export interface SessionNextResponse {
    debug?: Record<string, unknown>;
    // Navidrome track ids to enqueue.
    tracks: string[];
}

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');

export const recommenderSessionNext = async (
    baseUrl: string,
    body: SessionNextRequest,
    signal?: AbortSignal,
): Promise<SessionNextResponse> => {
    const { data } = await axios.post<SessionNextResponse>(
        `${normalizeBaseUrl(baseUrl)}/session/next`,
        body,
        { headers: { 'Content-Type': 'application/json' }, signal, timeout: 10000 },
    );

    return data;
};
