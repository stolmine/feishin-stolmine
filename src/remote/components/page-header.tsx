import { ReactNode } from 'react';

import { Flex } from '/@/shared/components/flex/flex';
import { Text } from '/@/shared/components/text/text';

interface PageHeaderProps {
    /** Right-aligned action controls (sort, display toggles, etc.) */
    actions?: ReactNode;
    /** Custom left-side content; replaces the default title text */
    children?: ReactNode;
    title?: string;
}

/**
 * Shared page header used across the remote tabs so every screen shares the
 * same title typography, spacing, and action-row rhythm.
 */
export const PageHeader = ({ actions, children, title }: PageHeaderProps) => {
    return (
        <Flex
            align="center"
            gap="sm"
            justify="space-between"
            px="md"
            py="sm"
            style={{ flexShrink: 0, minHeight: 56 }}
            w="100%"
        >
            <div style={{ minWidth: 0 }}>
                {children ?? (
                    <Text
                        fw={700}
                        style={{
                            fontSize: '1.5rem',
                            letterSpacing: '-0.02em',
                            lineHeight: 1.2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {title}
                    </Text>
                )}
            </div>
            {actions ? (
                <Flex align="center" gap="xs" style={{ flexShrink: 0 }}>
                    {actions}
                </Flex>
            ) : null}
        </Flex>
    );
};
