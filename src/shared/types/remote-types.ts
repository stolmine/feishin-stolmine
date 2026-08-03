import { LibraryItem, QueueSong, ServerListItemWithCredential } from '/@/shared/types/domain-types';
import { Play, PlayerRepeat, PlayerStatus, SongState } from '/@/shared/types/types';

export interface ClientAuth {
    event: 'authenticate';
    header: string;
}

export type ClientEvent =
    | ClientAuth
    | ClientFavorite
    | ClientPosition
    | ClientQueueAdd
    | ClientRating
    | ClientSimpleEvent
    | ClientVolume;

export interface ClientFavorite {
    event: 'favorite';
    favorite: boolean;
    id: string;
}

export interface ClientPosition {
    event: 'position';
    position: number;
}

export interface ClientQueueAdd {
    event: 'queueAdd';
    ids: string[];
    itemType: LibraryItem;
    playType: Play;
    serverId: string;
}

export interface ClientRating {
    event: 'rating';
    id: string;
    rating: number;
}
export interface ClientSimpleEvent {
    event: 'next' | 'pause' | 'play' | 'previous' | 'proxy' | 'repeat' | 'shuffle';
}

export interface ClientVolume {
    event: 'volume';
    volume: number;
}

export type RemoteServer = Omit<ServerListItemWithCredential, 'savePassword'>;

export interface ServerCurrentServer {
    data: null | RemoteServer;
    event: 'server';
}

export interface ServerError {
    data: string;
    event: 'error';
}

export type ServerEvent =
    | ServerCurrentServer
    | ServerError
    | ServerFavorite
    | ServerPlayStatus
    | ServerPosition
    | ServerProxy
    | ServerRating
    | ServerRepeat
    | ServerShuffle
    | ServerSong
    | ServerState
    | ServerVolume;

export interface ServerFavorite {
    data: { favorite: boolean; id: string };
    event: 'favorite';
}

export interface ServerPlayStatus {
    data: PlayerStatus;
    event: 'playback';
}

export interface ServerPosition {
    data: number;
    event: 'position';
}

export interface ServerProxy {
    data: string;
    event: 'proxy';
}

export interface ServerRating {
    data: { id: string; rating: number };
    event: 'rating';
}

export interface ServerRepeat {
    data: PlayerRepeat;
    event: 'repeat';
}

export interface ServerShuffle {
    data: boolean;
    event: 'shuffle';
}

export interface ServerSong {
    data: null | QueueSong;
    event: 'song';
}

export interface ServerState {
    data: SongState;
    event: 'state';
}

export interface ServerVolume {
    data: number;
    event: 'volume';
}

export interface SongUpdateSocket extends Omit<SongState, 'song'> {
    position?: number;
    song?: null | QueueSong;
}
