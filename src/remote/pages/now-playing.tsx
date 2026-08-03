import { RemoteContainer } from '/@/remote/components/remote-container';
import { useConnected } from '/@/remote/store';
import { Center } from '/@/shared/components/center/center';
import { Spinner } from '/@/shared/components/spinner/spinner';

export const NowPlayingPage = () => {
    const connected = useConnected();

    if (!connected) {
        return (
            <Center h="100%" w="100%">
                <Spinner />
            </Center>
        );
    }

    return <RemoteContainer />;
};
