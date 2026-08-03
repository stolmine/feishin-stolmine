import { UnstyledButton } from '@mantine/core';
import { ReactNode } from 'react';

import { Drawer } from '/@/shared/components/drawer/drawer';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

export interface ActionItem {
    icon?: ReactNode;
    label: string;
    onClick: () => void;
}

interface ActionSheetProps {
    actions: ActionItem[];
    onClose: () => void;
    opened: boolean;
    title?: string;
}

export const ActionSheet = ({ actions, onClose, opened, title }: ActionSheetProps) => {
    return (
        <Drawer
            onClose={onClose}
            opened={opened}
            padding="md"
            position="bottom"
            size="auto"
            title={title}
            withCloseButton={!!title}
        >
            <Stack gap={0}>
                {actions.map((action) => (
                    <UnstyledButton
                        key={action.label}
                        onClick={() => {
                            action.onClick();
                        }}
                        style={{
                            alignItems: 'center',
                            display: 'flex',
                            gap: 16,
                            minHeight: 52,
                            padding: '12px 8px',
                            width: '100%',
                        }}
                    >
                        {action.icon}
                        <Text fw={500}>{action.label}</Text>
                    </UnstyledButton>
                ))}
            </Stack>
        </Drawer>
    );
};
