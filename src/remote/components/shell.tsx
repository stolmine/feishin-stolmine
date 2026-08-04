import { AppShell } from '@mantine/core';
import { Outlet } from 'react-router';

import { TabBar } from '/@/remote/components/tab-bar';

export const Shell = () => {
    return (
        <AppShell h="100vh" padding={0} w="100vw">
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
                    // No logo header — content starts near the top edge with a
                    // tasteful margin that clears the device status bar / notch.
                    paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
                }}
            >
                <Outlet />
            </AppShell.Main>
            <TabBar />
        </AppShell>
    );
};
