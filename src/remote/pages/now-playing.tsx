import { RiPlayListLine } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { RemoteContainer } from '/@/remote/components/remote-container';
import { useConnected } from '/@/remote/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Spinner } from '/@/shared/components/spinner/spinner';

export const NowPlayingPage = () => {
    const connected = useConnected();
    const navigate = useNavigate();

    if (!connected) {
        return (
            <Center h="100%" w="100%">
                <Spinner />
            </Center>
        );
    }

    return (
        <div style={{ height: '100%', position: 'relative', width: '100%' }}>
            <ActionIcon
                onClick={() => navigate('/queue')}
                style={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}
                tooltip={{ label: 'Queue' }}
                variant="transparent"
            >
                <RiPlayListLine size={22} />
            </ActionIcon>
            <RemoteContainer />
        </div>
    );
};
