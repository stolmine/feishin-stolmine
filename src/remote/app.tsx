import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';

import '/@/shared/styles/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';

import { queryClient } from '/@/remote/lib/query-client';
import { router } from '/@/remote/router';
import { useIsDark, useReconnect, useServerTheme } from '/@/remote/store';
import { useAppTheme } from '/@/renderer/themes/use-app-theme';
import { AppTheme } from '/@/shared/themes/app-theme-types';

export const App = () => {
    const isDark = useIsDark();
    const reconnect = useReconnect();
    const serverTheme = useServerTheme();

    useEffect(() => {
        reconnect();
    }, [reconnect]);

    const { mode, theme } = useAppTheme(
        serverTheme
            ? (serverTheme.theme as AppTheme)
            : isDark
              ? AppTheme.DEFAULT_DARK
              : AppTheme.DEFAULT_LIGHT,
    );

    return (
        <QueryClientProvider client={queryClient}>
            <MantineProvider forceColorScheme={mode} theme={theme}>
                <RouterProvider router={router} />
            </MantineProvider>
        </QueryClientProvider>
    );
};
