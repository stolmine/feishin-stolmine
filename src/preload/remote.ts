import { ipcRenderer } from 'electron';

import { LibraryItem, QueueSong } from '/@/shared/types/domain-types';
import { RemoteServer, RemoteTheme, ServerQueue } from '/@/shared/types/remote-types';
import { Play, PlayerStatus } from '/@/shared/types/types';

const requestFavorite = (
    cb: (data: { favorite: boolean; id: string; serverId: string }) => void,
) => {
    ipcRenderer.on('request-favorite', (_, data) => cb(data));
};

const requestPosition = (cb: (data: { position: number }) => void) => {
    ipcRenderer.on('request-position', (_, data) => cb(data));
};

const requestQueueAdd = (
    cb: (data: { ids: string[]; itemType: LibraryItem; playType: Play; serverId: string }) => void,
) => {
    ipcRenderer.on('request-queue-add', (_, data) => cb(data));
};

const requestQueueClear = (cb: () => void) => {
    ipcRenderer.on('request-queue-clear', () => cb());
};

const requestQueueMove = (
    cb: (data: { edge: 'bottom' | 'top'; targetUniqueId: string; uniqueIds: string[] }) => void,
) => {
    ipcRenderer.on('request-queue-move', (_, data) => cb(data));
};

const requestQueuePlay = (cb: (data: { uniqueId: string }) => void) => {
    ipcRenderer.on('request-queue-play', (_, data) => cb(data));
};

const requestQueueRemove = (cb: (data: { uniqueIds: string[] }) => void) => {
    ipcRenderer.on('request-queue-remove', (_, data) => cb(data));
};

const requestRating = (cb: (data: { id: string; rating: number; serverId: string }) => void) => {
    ipcRenderer.on('request-rating', (_, data) => cb(data));
};

const requestSeek = (cb: (data: { offset: number }) => void) => {
    ipcRenderer.on('request-seek', (_, data) => cb(data));
};

const requestVolume = (cb: (data: { volume: number }) => void) => {
    ipcRenderer.on('request-volume', (_, data) => cb(data));
};

const setRemoteEnabled = (enabled: boolean): Promise<null | string> => {
    const result = ipcRenderer.invoke('remote-enable', enabled);
    return result;
};

const setRemotePort = (port: number): Promise<null | string> => {
    const result = ipcRenderer.invoke('remote-port', port);
    return result;
};

const updateFavorite = (favorite: boolean, serverId: string, ids: string[]) => {
    ipcRenderer.send('update-favorite', favorite, serverId, ids);
};

const updatePassword = (password: string) => {
    ipcRenderer.send('remote-password', password);
};

const updatePlayback = (playback: PlayerStatus) => {
    ipcRenderer.send('update-playback', playback);
};

const updateSetting = (
    enabled: boolean,
    port: number,
    username: string,
    password: string,
): Promise<null | string> => {
    return ipcRenderer.invoke('remote-settings', enabled, port, username, password);
};

const updateRating = (rating: number, serverId: string, ids: string[]) => {
    ipcRenderer.send('update-rating', rating, serverId, ids);
};

const updateRepeat = (repeat: string) => {
    ipcRenderer.send('update-repeat', repeat);
};

const updateServer = (server: null | RemoteServer) => {
    ipcRenderer.send('update-server', server);
};

const updateTheme = (theme: null | RemoteTheme) => {
    ipcRenderer.send('update-theme', theme);
};

const updateShuffle = (shuffle: boolean) => {
    ipcRenderer.send('update-shuffle', shuffle);
};

const updateSong = (song: QueueSong | undefined, imageUrl?: null | string) => {
    ipcRenderer.send('update-song', song, imageUrl);
};

const updateUsername = (username: string) => {
    ipcRenderer.send('remote-username', username);
};

const updateVolume = (volume: number) => {
    ipcRenderer.send('update-volume', volume);
};

const updateQueue = (queue: ServerQueue['data']) => {
    ipcRenderer.send('update-queue', queue);
};

const updatePosition = (timeSec: number) => {
    ipcRenderer.send('update-position', timeSec);
};

export const remote = {
    requestFavorite,
    requestPosition,
    requestQueueAdd,
    requestQueueClear,
    requestQueueMove,
    requestQueuePlay,
    requestQueueRemove,
    requestRating,
    requestSeek,
    requestVolume,
    setRemoteEnabled,
    setRemotePort,
    updateFavorite,
    updatePassword,
    updatePlayback,
    updatePosition,
    updateQueue,
    updateRating,
    updateRepeat,
    updateServer,
    updateSetting,
    updateShuffle,
    updateSong,
    updateTheme,
    updateUsername,
    updateVolume,
};

export type Remote = typeof remote;
