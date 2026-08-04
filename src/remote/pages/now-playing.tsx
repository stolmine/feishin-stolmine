import { RiPlayListLine } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { PageHeader } from '/@/remote/components/page-header';
import { RemoteContainer } from '/@/remote/components/remote-container';
import { useConnected } from '/@/remote/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Flex } from '/@/shared/components/flex/flex';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Text } from '/@/shared/components/text/text';

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
        <Flex direction="column" h="100%" w="100%">
            <PageHeader
                actions={
                    <ActionIcon
                        onClick={() => navigate('/queue')}
                        size="md"
                        tooltip={{ label: 'Queue' }}
                        variant="subtle"
                    >
                        <RiPlayListLine size={22} />
                    </ActionIcon>
                }
            >
                <Text
                    fw={600}
                    isMuted
                    size="xs"
                    style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}
                >
                    Now Playing
                </Text>
            </PageHeader>
            <div style={{ flex: 1, minHeight: 0 }}>
                <RemoteContainer />
            </div>
        </Flex>
    );
};
