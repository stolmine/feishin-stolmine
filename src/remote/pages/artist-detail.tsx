import { useParams } from 'react-router';

import { Center } from '/@/shared/components/center/center';
import { Text } from '/@/shared/components/text/text';

export const ArtistDetailPage = () => {
    const { id } = useParams<{ id: string }>();

    return (
        <Center h="100%" w="100%">
            <Text isMuted>Artist {id} — coming soon</Text>
        </Center>
    );
};
