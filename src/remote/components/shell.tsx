import { AppShell, Flex, Image } from '@mantine/core';
import { Outlet } from 'react-router';

import { TabBar } from '/@/remote/components/tab-bar';

export const Shell = () => {
    return (
        <AppShell h="100vh" padding={0} w="100vw">
            <AppShell.Header style={{ background: 'var(--theme-colors-surface)' }}>
                <Flex align="center" h="100%" justify="center" px="md">
                    <Image fit="contain" height={32} src="/favicon.ico" width={32} />
                </Flex>
            </AppShell.Header>
            <AppShell.Main
                style={{
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    // Bound the main region to the viewport so each tab's virtualized
                    // list establishes its OWN internal scroll region instead of the
                    // page body growing unbounded (which made lists unscrollable).
                    height: '100dvh',
                    overflow: 'hidden',
                    paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
                    paddingTop: '60px',
                }}
            >
                <Outlet />
            </AppShell.Main>
            <TabBar />
        </AppShell>
    );
};
