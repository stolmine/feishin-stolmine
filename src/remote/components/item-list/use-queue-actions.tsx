import { useMemo } from 'react';
import { RiPlayFill, RiPlayListAddLine, RiShuffleLine, RiSkipForwardFill } from 'react-icons/ri';

import { ActionItem } from '/@/remote/components/action-sheet';
import { useSend } from '/@/remote/store';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

interface UseQueueActionsArgs {
    id: string;
    itemType: LibraryItem;
    onClose: () => void;
    serverId: string;
}

export const useQueueActions = ({
    id,
    itemType,
    onClose,
    serverId,
}: UseQueueActionsArgs): ActionItem[] => {
    const send = useSend();

    return useMemo(() => {
        const enqueue = (playType: Play, message: string) => {
            send({ event: 'queueAdd', ids: [id], itemType, playType, serverId });
            onClose();
            toast.success({ message });
        };

        return [
            {
                icon: <RiPlayFill size={20} />,
                label: 'Play Now',
                onClick: () => enqueue(Play.NOW, 'Playing now'),
            },
            {
                icon: <RiSkipForwardFill size={20} />,
                label: 'Play Next',
                onClick: () => enqueue(Play.NEXT, 'Added to play next'),
            },
            {
                icon: <RiPlayListAddLine size={20} />,
                label: 'Play Last',
                onClick: () => enqueue(Play.LAST, 'Added to queue'),
            },
            {
                icon: <RiShuffleLine size={20} />,
                label: 'Shuffle',
                onClick: () => enqueue(Play.SHUFFLE, 'Shuffling'),
            },
        ];
    }, [id, itemType, onClose, send, serverId]);
};
